package cn.mdtbbs.renderer;

import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.graphics.Pixmap;
import arc.graphics.PixmapIO;
import arc.util.serialization.JsonReader;
import arc.util.serialization.JsonValue;
import arc.util.serialization.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import mindustry.Vars;
import mindustry.core.Logic;
import mindustry.core.Platform;
import mindustry.core.Version;
import mindustry.ctype.ContentType;
import mindustry.entities.units.BuildPlan;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import mindustry.io.MapIO;
import mindustry.io.SaveIO;
import mindustry.io.SaveMeta;
import mindustry.maps.Map;
import mindustry.net.Net;
import mindustry.world.Block;
import arc.math.geom.Point2;
import arc.struct.Seq;
import arc.struct.StringMap;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.util.zip.InflaterInputStream;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map.Entry;
import java.util.List;
import java.util.HexFormat;
import java.util.concurrent.Executors;

/**
 * Restricted local renderer.  It never loads mods or connects to a client: it
 * only uses official MapIO/Schematics readers and writes a derived PNG.
 */
public final class MapRenderer {
    private static final int MAX_MAP_LAYER_ITEMS = 5_000;
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final String VERSION = "v160.2-preview-5-resource-layers";
    private static final JsonReader JSON = new JsonReader();
    private static Path storageRoot;
    private static String token;
    private static SpriteAtlas spriteAtlas;
    private static Properties chineseBundle;

    private MapRenderer() {}

    public static void main(String[] args) {
        storageRoot = Path.of(env("STORAGE_ROOT", "./uploads/previews")).toAbsolutePath().normalize();
        token = env("WORKER_TOKEN", "");
        Vars.platform = new Platform() {};
        Vars.net = new Net(Vars.platform.getNet());
        Vars.loadLocales = false;
        new HeadlessApplication(new ApplicationListener() {
            @Override public void init() {
                try {
                    initialize();
                    start();
                } catch (IOException exception) {
                    throw new RuntimeException("cannot start Mindustry renderer", exception);
                }
            }
        }, throwable -> throwable.printStackTrace(System.err));
    }

    static void initialize() {
        Vars.headless = true;
        Core.settings.setDataDirectory(new Fi(storageRoot.resolve("worker-config").toFile()));
        Vars.loadSettings();
        Vars.init();
        Vars.content.createBaseContent();
        Vars.content.init();
        Vars.logic = new Logic();
        spriteAtlas = SpriteAtlas.load(env("ASSETS_ROOT", ""));
        chineseBundle = loadChineseBundle();
    }

    static void initializeForFixture(Path root) {
        storageRoot = root.toAbsolutePath().normalize();
        Vars.platform = new Platform() {};
        Vars.net = new Net(Vars.platform.getNet());
        Vars.headless = true;
        Core.settings.setDataDirectory(new Fi(storageRoot.resolve("worker-config").toFile()));
        Vars.init();
        Vars.content.createBaseContent();
        Vars.content.init();
        Vars.logic = new Logic();
        spriteAtlas = SpriteAtlas.load(env("ASSETS_ROOT", ""));
        chineseBundle = new Properties();
    }

    private static void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(env("WORKER_HOST", "127.0.0.1"), Integer.parseInt(env("WORKER_PORT", "6100"))), 8);
        server.createContext("/health", MapRenderer::health);
        server.createContext("/v1/analyze", MapRenderer::analyze);
        server.createContext("/v1/transform-schematic", MapRenderer::transformSchematic);
        server.createContext("/v1/content-metadata", MapRenderer::contentMetadata);
        server.setExecutor(Executors.newSingleThreadExecutor());
        server.start();
        System.out.println("MindFourm renderer listening on loopback");
    }

    private static void health(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        send(exchange, 200, "{\"status\":\"ok\",\"mindustryVersion\":\"" + VERSION + "\",\"textureAssets\":" + (spriteAtlas != null) + "}");
    }

    /** Resolve all requested vanilla icons/names in one request, using the bundled official atlas and zh_CN bundle. */
    private static void contentMetadata(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        try {
            java.util.Map<String, String> query = queryParameters(exchange.getRequestURI().getRawQuery());
            String items = contentEntries(query.getOrDefault("items", ""), ContentType.item);
            String blocks = contentEntries(query.getOrDefault("blocks", ""), ContentType.block);
            String liquids = contentEntries(query.getOrDefault("liquids", ""), ContentType.liquid);
            send(exchange, 200, "{\"items\":" + items + ",\"blocks\":" + blocks + ",\"liquids\":" + liquids + "}");
        } catch (IllegalArgumentException exception) {
            send(exchange, 400, error("INVALID_CONTENT_QUERY"));
        }
    }

    private static String contentEntries(String encodedIds, ContentType type) throws IOException {
        StringBuilder result = new StringBuilder("{");
        if (!encodedIds.isBlank()) {
            String[] ids = encodedIds.split(",");
            if (ids.length > 100) throw new IllegalArgumentException("too many content ids");
            boolean first = true;
            for (String id : ids) {
                if (!id.matches("[a-zA-Z0-9_.-]{1,100}")) throw new IllegalArgumentException("invalid content id");
                if (!first) result.append(',');
                first = false;
                String prefix = type == ContentType.item ? "item." : type == ContentType.liquid ? "liquid." : "block.";
                String key = prefix + id + ".name";
                String localizedName = chineseBundle == null ? null : chineseBundle.getProperty(key);
                BufferedImage icon = spriteAtlas == null ? null
                    : type == ContentType.item ? spriteAtlas.findItem(id)
                    : type == ContentType.liquid ? spriteAtlas.findLiquid(id) : spriteAtlas.findBlock(id);
                String iconData = "null";
                if (icon != null) {
                    ByteArrayOutputStream png = new ByteArrayOutputStream();
                    ImageIO.write(icon, "png", png);
                    iconData = quote("data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray()));
                }
                result.append(quote(id)).append(":{\"name\":")
                    .append(quote(localizedName == null || localizedName.isBlank() ? id : localizedName))
                    .append(",\"icon\":").append(iconData).append('}');
            }
        }
        return result.append('}').toString();
    }

    private static Properties loadChineseBundle() {
        Properties properties = new Properties();
        try (var stream = MapRenderer.class.getResourceAsStream("/bundles/bundle_zh_CN.properties")) {
            if (stream == null) return properties;
            properties.load(new InputStreamReader(stream, StandardCharsets.UTF_8));
        } catch (IOException exception) {
            System.err.println("could not load Mindustry zh_CN bundle: " + exception.getMessage());
        }
        return properties;
    }

    private static java.util.Map<String, String> queryParameters(String rawQuery) {
        HashMap<String, String> result = new HashMap<>();
        if (rawQuery == null || rawQuery.isBlank()) return result;
        for (String parameter : rawQuery.split("&")) {
            String[] pair = parameter.split("=", 2);
            result.put(URLDecoder.decode(pair[0], StandardCharsets.UTF_8), pair.length == 2 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "");
        }
        return result;
    }

    private static void analyze(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        Path input = null;
        String kind = "map";
        try {
            JsonValue request = JSON.parse(new String(readLimited(exchange, MAX_BYTES * 2), StandardCharsets.UTF_8));
            String filename = request.getString("filename", "");
            kind = request.getString("resourceType", "");
            String hash = request.getString("sha256", "").toLowerCase();
            String encoded = request.getString("dataBase64", "");
            boolean isMap = "map".equals(kind) && filename.toLowerCase().endsWith(".msav");
            boolean isSchematic = "schematic".equals(kind) && filename.toLowerCase().endsWith(".msch");
            if ((!isMap && !isSchematic) || !hash.matches("[a-f0-9]{64}") || encoded.isEmpty()) { send(exchange, 422, error("INVALID_FILE")); return; }
            byte[] data = Base64.getDecoder().decode(encoded);
            if (data.length == 0 || data.length > MAX_BYTES || !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data)).equals(hash)) {
                send(exchange, 422, error("INVALID_FILE")); return;
            }
            Path inputs = storageRoot.resolve("worker-input").normalize();
            Files.createDirectories(inputs);
            input = Files.createTempFile(inputs, kind + "-", isMap ? ".msav" : ".msch");
            Files.write(input, data);
            if (isMap) renderMap(exchange, input, hash); else renderSchematic(exchange, input, hash);
        } catch (Exception exception) {
            exception.printStackTrace(System.err);
            send(exchange, 422, error("schematic".equals(kind) ? "INVALID_SCHEMATIC" : "INVALID_MAP"));
        } finally {
            if (input != null) Files.deleteIfExists(input);
        }
    }

    /** Applies only official in-memory schematic transforms; uploaded content is never loaded as code or executed. */
    private static void transformSchematic(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        Path input = null;
        try {
            JsonValue request = JSON.parse(new String(readLimited(exchange, MAX_BYTES * 2), StandardCharsets.UTF_8));
            String filename = request.getString("filename", "");
            String sourceHash = request.getString("sha256", "").toLowerCase();
            String encoded = request.getString("dataBase64", "");
            int rotation = request.getInt("rotation_quarters", 0);
            boolean mirrorX = request.getBoolean("mirror_x", false);
            JsonValue rawDeletes = request.get("delete_positions");
            if (filename.length() > 255 || !filename.toLowerCase().endsWith(".msch")
                || !sourceHash.matches("[a-f0-9]{64}") || encoded.isEmpty()
                || rotation < 0 || rotation > 3 || (rawDeletes != null && !rawDeletes.isArray())) {
                send(exchange, 422, error("INVALID_SCHEMATIC_OPERATION")); return;
            }
            byte[] source = Base64.getDecoder().decode(encoded);
            String actualHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source));
            if (source.length == 0 || source.length > MAX_BYTES || !actualHash.equals(sourceHash)) {
                send(exchange, 422, error("INVALID_FILE")); return;
            }
            List<Point2> deletePositions = readDeletePositions(rawDeletes);
            Path inputs = storageRoot.resolve("worker-input").normalize();
            Files.createDirectories(inputs);
            input = Files.createTempFile(inputs, "schematic-edit-", ".msch");
            Files.write(input, source);
            byte[] output = transformSchematicBytes(input, rotation, mirrorX, deletePositions);
            String outputHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(output));
            String result = "{\"dataBase64\":" + quote(Base64.getEncoder().encodeToString(output))
                + ",\"sha256\":" + quote(outputHash) + "}";
            send(exchange, 200, result);
        } catch (SchematicTransformException exception) {
            send(exchange, 422, error(exception.errorCode));
        } catch (IllegalArgumentException exception) {
            send(exchange, 422, error("INVALID_SCHEMATIC_OPERATION"));
        } catch (Exception exception) {
            exception.printStackTrace(System.err);
            send(exchange, 422, error("INVALID_SCHEMATIC"));
        } finally {
            if (input != null) Files.deleteIfExists(input);
        }
    }

    private static List<Point2> readDeletePositions(JsonValue raw) throws SchematicTransformException {
        java.util.ArrayList<Point2> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<Long> unique = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 10_000 || !item.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            int x = item.getInt("x", Integer.MIN_VALUE);
            int y = item.getInt("y", Integer.MIN_VALUE);
            if (x == Integer.MIN_VALUE || y == Integer.MIN_VALUE || Math.abs(x) > 128 || Math.abs(y) > 128
                || !unique.add((((long)x) << 32) ^ (y & 0xffffffffL))) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            result.add(new Point2(x, y));
        }
        return result;
    }

    /**
     * Decodes with Mindustry's official reader and serializes with its official
     * writer. Unknown block/content definitions are rejected because read()
     * deliberately replaces unknown blocks with air and could otherwise lose data.
     */
    static byte[] transformSchematicBytes(Path input, int rotationQuarterTurns, boolean mirrorX, List<Point2> deletePositions) throws IOException, SchematicTransformException {
        if (rotationQuarterTurns < 0 || rotationQuarterTurns > 3) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
        List<String> unknown = unknownSchematicEditContent(input);
        if (!unknown.isEmpty()) throw new SchematicTransformException("UNSUPPORTED_SCHEMATIC_CONTENT");

        Schematic source = Schematics.read(new Fi(input.toFile()));
        java.util.HashSet<Long> requested = new java.util.HashSet<>();
        for (Point2 position : deletePositions) {
            if (position.x < 0 || position.y < 0 || position.x >= source.width || position.y >= source.height
                || !requested.add((((long)position.x) << 32) ^ (position.y & 0xffffffffL))) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
        }
        java.util.HashSet<Long> found = new java.util.HashSet<>();
        for (int index = source.tiles.size - 1; index >= 0; index--) {
            Schematic.Stile tile = source.tiles.get(index);
            long position = (((long)tile.x) << 32) ^ (tile.y & 0xffffffffL);
            if (requested.contains(position)) {
                source.tiles.remove(index);
                found.add(position);
            }
        }
        if (found.size() != requested.size()) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");

        StringMap tags = new StringMap();
        tags.putAll(source.tags);
        Seq<String> labels = new Seq<>();
        if (source.labels != null) labels.addAll(source.labels);
        Schematic rotated = Schematics.rotate(source, rotationQuarterTurns);
        Schematic result = copySchematic(rotated);
        result.tags.clear();
        result.tags.putAll(tags);
        result.labels.clear();
        result.labels.addAll(labels);
        if (mirrorX) mirrorSchematicX(result);
        for (Schematic.Stile tile : result.tiles) {
            if (tile.x < 0 || tile.y < 0 || tile.x >= result.width || tile.y >= result.height) {
                throw new SchematicTransformException("INVALID_SCHEMATIC");
            }
        }

        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
        Schematics.write(result, output);
        byte[] bytes = output.toByteArray();
        if (bytes.length < 5 || bytes.length > MAX_BYTES) throw new SchematicTransformException("INVALID_SCHEMATIC");
        Schematic verified = Schematics.read(new java.io.ByteArrayInputStream(bytes));
        if (verified.width != result.width || verified.height != result.height || verified.tiles.size != result.tiles.size
            || !SchematicFingerprint.exact(verified).equals(SchematicFingerprint.exact(result))) {
            throw new SchematicTransformException("INVALID_SCHEMATIC");
        }
        return bytes;
    }

    private static Schematic copySchematic(Schematic source) {
        Seq<Schematic.Stile> tiles = new Seq<>(source.tiles.size);
        for (Schematic.Stile tile : source.tiles) tiles.add(tile.copy());
        StringMap tags = new StringMap();
        tags.putAll(source.tags);
        Schematic copy = new Schematic(tiles, tags, source.width, source.height);
        if (source.labels != null) copy.labels.addAll(source.labels);
        return copy;
    }

    /** Horizontal reflection through the schematic's vertical centerline. */
    private static void mirrorSchematicX(Schematic schematic) {
        for (Schematic.Stile tile : schematic.tiles) {
            tile.x = (short)(schematic.width - 1 - tile.x);
            BuildPlan plan = new BuildPlan(tile.x, tile.y, tile.rotation, tile.block, tile.config);
            plan.config = BuildPlan.pointConfig(tile.block, tile.config, point -> point.x = -point.x);
            tile.block.flipRotation(plan, true);
            tile.rotation = (byte)plan.rotation;
            tile.config = plan.config;
        }
    }

    private static List<String> unknownSchematicEditContent(Path input) throws IOException, SchematicTransformException {
        try (DataInputStream file = new DataInputStream(Files.newInputStream(input))) {
            if (file.readInt() != 0x6d736368) throw new SchematicTransformException("INVALID_SCHEMATIC");
            int formatVersion = file.readUnsignedByte();
            if (formatVersion != 1) throw new SchematicTransformException("UNSUPPORTED_SCHEMATIC_FORMAT");
            try (DataInputStream data = new DataInputStream(new InflaterInputStream(file))) {
                int width = data.readShort();
                int height = data.readShort();
                if (width <= 0 || height <= 0 || width > 128 || height > 128) throw new SchematicTransformException("INVALID_SCHEMATIC");
                StringMap tags = new StringMap();
                int tagCount = data.readUnsignedByte();
                for (int index = 0; index < tagCount; index++) tags.put(data.readUTF(), data.readUTF());
                String contentMap = tags.get("contentMap");
                if (contentMap == null || contentMap.isBlank()) throw new SchematicTransformException("UNSUPPORTED_SCHEMATIC_CONTENT");
                JsonValue mappedContent = JSON.parse(contentMap);
                if (mappedContent == null || !mappedContent.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC");
                java.util.ArrayList<String> unknown = new java.util.ArrayList<>();
                for (JsonValue typeEntry = mappedContent.child; typeEntry != null; typeEntry = typeEntry.next) {
                    int typeOrdinal;
                    try { typeOrdinal = Integer.parseInt(typeEntry.name); }
                    catch (NumberFormatException exception) { throw new SchematicTransformException("INVALID_SCHEMATIC"); }
                    if (typeOrdinal < 0 || typeOrdinal >= ContentType.all.length || !typeEntry.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC");
                    ContentType type = ContentType.all[typeOrdinal];
                    for (JsonValue contentEntry = typeEntry.child; contentEntry != null; contentEntry = contentEntry.next) {
                        if (Vars.content.getByName(type, contentEntry.name) == null) unknown.add(type.name() + ":" + contentEntry.name);
                    }
                }
                int blockCount = data.readUnsignedByte();
                for (int index = 0; index < blockCount; index++) {
                    String name = data.readUTF();
                    Block block = Vars.content.getByName(ContentType.block, mindustry.io.SaveFileReader.fallback.get(name, name));
                    if (block == null || isA(block, "LegacyBlock")) unknown.add("block:" + name);
                }
                return List.copyOf(unknown);
            }
        } catch (SchematicTransformException | IOException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new SchematicTransformException("INVALID_SCHEMATIC");
        }
    }

    static final class SchematicTransformException extends Exception {
        final String errorCode;
        SchematicTransformException(String errorCode) { super(errorCode); this.errorCode = errorCode; }
    }

    private static void renderMap(HttpExchange exchange, Path input, String hash) throws IOException {
        Map map = MapIO.createMap(new Fi(input.toFile()), true);
        SaveMeta storedMeta = SaveIO.getMeta(new Fi(input.toFile()));
        // In v160.2 this reads the saved preview_map tile graph itself (floor,
        // overlay, blocks and building team colors); it does not depend on the
        // subsequently loaded global World. Keep preview generation before the
        // full load so malformed building state cannot affect the thumbnail.
        Pixmap preview = MapIO.generatePreview(map);
        String key = previewKey("map", hash);
        Path target = target(key);
        PixmapIO.writePng(new Fi(target.toFile()), preview);
        preview.dispose();
        // The header contains rules, but cores and their positions live in the
        // loaded tile/build graph. This is kept behind a best-effort boundary:
        // a valid map preview must remain usable when an old format cannot load
        // its tile graph in the bundled runtime.
        boolean tilesLoaded = false;
        try { MapIO.loadMap(map); tilesLoaded = true; } catch (Throwable ignored) { /* header-only map */ }
        send(exchange, 200, result(mapMetadata(map, tilesLoaded, storedMeta), key));
    }

    private static void renderSchematic(HttpExchange exchange, Path input, String hash) throws IOException {
        List<String> unknownBlocks = unknownSchematicBlocks(input);
        Schematic schematic = Schematics.read(new Fi(input.toFile()));
        byte[] header = Files.readAllBytes(input);
        int formatVersion = header.length > 4 ? header[4] & 0xff : -1;
        BufferedImage image = renderSchematicImage(schematic);
        String key = previewKey("schematic", hash);
        if (!ImageIO.write(image, "png", target(key).toFile())) throw new IOException("PNG writer unavailable");
        send(exchange, 200, result(schematicMetadata(schematic, unknownBlocks, formatVersion), key));
    }

    static BufferedImage renderSchematicImage(Schematic schematic) {
        int tileSize = Math.max(4, Math.min(32, 640 / Math.max(1, Math.max(schematic.width, schematic.height))));
        int padding = tileSize;
        BufferedImage image = new BufferedImage(Math.max(1, schematic.width * tileSize + padding * 2), Math.max(1, schematic.height * tileSize + padding * 2), BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = image.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
        graphics.setColor(new Color(15, 20, 25));
        graphics.fillRect(0, 0, image.getWidth(), image.getHeight());
        BufferedImage background = spriteAtlas == null ? null : spriteAtlas.standalone("schematic-background.png");
        if (background != null) {
            for (int x = 0; x < image.getWidth(); x += background.getWidth()) {
                for (int y = 0; y < image.getHeight(); y += background.getHeight()) {
                    graphics.drawImage(background, x, y, null);
                }
            }
        }
        graphics.dispose();
        for (Schematic.Stile tile : schematic.tiles) drawSchematicTile(image, tile, schematic.height, tileSize, padding);
        return image;
    }

    /**
     * MapIO exposes the map header and Rules object without exposing the tile
     * grid.  Report only values that come from those objects.  In particular,
     * Runtime defaults are never treated as file metadata. The saved build is
     * read from SaveMeta.tags and remains null when the file has no such tag.
     */
    static String mapMetadata(Map map, boolean tilesLoaded, SaveMeta storedMeta) {
        mindustry.game.Rules rules = null;
        try { rules = map.rules(); } catch (Throwable ignored) { /* optional map rules */ }
        String planet = rules != null && rules.planet != null ? rules.planet.name : "";
        String mode = rules != null && rules.modeName != null ? rules.modeName : "";
        String tags = joinMapTags(map);
        String dependencies = map.mod != null ? map.mod.name : map.tags.get("mod", "");
        String teams = teamNames(map);
        String waves = rules == null ? "null" : Boolean.toString(rules.waves);
        String rulesJson = rulesJson(rules);
        String spawnGroups = spawnGroupsJson(rules);
        String bannedBlocks = rules == null ? "[]" : contentNames(rules.bannedBlocks);
        String bannedUnits = rules == null ? "[]" : unitNames(rules.bannedUnits);
        String tileMetadata = mapTileMetadata(map, tilesLoaded);
        boolean hasStoredBuild = storedMeta != null && storedMeta.tags != null && storedMeta.tags.containsKey("build") && storedMeta.build > 0;
        String build = hasStoredBuild ? Integer.toString(storedMeta.build) : "null";
        return "{" +
            "\"name\":" + quote(map.tags.get("name", "")) +
            ",\"author\":" + quote(map.tags.get("author", "")) +
            ",\"description\":" + quote(map.tags.get("description", "")) +
            ",\"width\":" + map.width +
            ",\"height\":" + map.height +
            ",\"spawns\":" + map.spawns +
            ",\"version\":" + map.version +
            ",\"save_format_version\":" + map.version +
            ",\"build\":" + build +
            ",\"map_build_metadata\":{\"stored_game_build\":" + build + ",\"source\":" + quote(hasStoredBuild ? "file_metadata" : "unknown") + "}" +
            ",\"parser_runtime\":{\"mindustry_build\":" + Version.build + ",\"renderer_version\":" + quote(VERSION) + "}" +
            ",\"planet\":" + quote(planet) +
            ",\"game_modes\":" + stringArray(mode) +
            ",\"teams\":" + stringArray(teams) +
            ",\"tags\":" + stringArray(tags) +
            ",\"mod_dependencies\":" + stringArray(dependencies) +
            ",\"waves\":" + waves +
            ",\"wave_groups\":" + spawnGroups +
            ",\"banned_blocks\":" + bannedBlocks +
            ",\"banned_units\":" + bannedUnits +
            ",\"rules\":" + rulesJson +
            ",\"core_count\":" + jsonField(tileMetadata, "core_count", "0") +
            ",\"cores\":" + jsonField(tileMetadata, "cores", "[]") +
            ",\"core_teams\":" + jsonField(tileMetadata, "core_teams", "[]") +
            ",\"tile_layers\":" + jsonField(tileMetadata, "tile_layers", "{}") +
            ",\"tile_layers_truncated\":" + jsonField(tileMetadata, "tile_layers_truncated", "false") +
            "}";
    }

    private static String mapTileMetadata(Map map, boolean tilesLoaded) {
        if (!tilesLoaded || Vars.world == null || Vars.world.tiles == null || Vars.world.tiles.width != map.width || Vars.world.tiles.height != map.height) {
            return "{\"core_count\":0,\"cores\":[],\"core_teams\":[],\"tile_layers\":{},\"tile_layers_truncated\":false}";
        }
        JsonArrayBuilder cores = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        JsonArrayBuilder terrain = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        JsonArrayBuilder resources = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        JsonArrayBuilder ores = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        JsonArrayBuilder enemySpawns = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        JsonArrayBuilder buildings = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        JsonArrayBuilder liquids = new JsonArrayBuilder(MAX_MAP_LAYER_ITEMS);
        java.util.HashSet<String> coreTeams = new java.util.HashSet<>();
        int count = 0;
        for (mindustry.world.Tile tile : Vars.world.tiles) {
            String position = "\"x\":" + tile.x + ",\"y\":" + tile.y;
            terrain.add("{" + position + ",\"name\":" + quote(tile.floor().name) + "}");
            mindustry.type.Item drop = tile.drop();
            if (drop != null) resources.add("{" + position + ",\"name\":" + quote(drop.name) + "}");
            if (tile.overlay().wallOre && tile.overlay().itemDrop != null) {
                ores.add("{" + position + ",\"name\":" + quote(tile.overlay().itemDrop.name) + "}");
            }
            if (tile.floor().liquidDrop != null) {
                liquids.add("{" + position + ",\"name\":" + quote(tile.floor().liquidDrop.name) + "}");
            }
            if (isA(tile.block(), "SpawnBlock")) {
                enemySpawns.add("{" + position + ",\"name\":" + quote(tile.block().name) + "}");
            }
            if (tile.isCenter() && tile.build != null) {
                mindustry.game.Team team = tile.team();
                String teamName = team == null ? "" : team.name;
                buildings.add("{" + position + ",\"name\":" + quote(tile.block().name) + ",\"team\":" + quote(teamName) + "}");
                if (tile.build instanceof mindustry.world.blocks.storage.CoreBlock.CoreBuild) {
                    cores.add("{" + position + ",\"team\":" + quote(teamName) + "}");
                    coreTeams.add(teamName);
                    count++;
                }
            }
        }
        JsonArrayBuilder teams = new JsonArrayBuilder(100);
        for (String team : coreTeams) {
            teams.add(quote(team));
        }
        String tileLayers = "{\"terrain\":" + terrain + ",\"resources\":" + resources + ",\"ores\":" + ores
            + ",\"enemy_spawns\":" + enemySpawns + ",\"buildings\":" + buildings + ",\"player_area\":[]"
            + ",\"liquid\":" + liquids + "}";
        boolean truncated = cores.truncated || terrain.truncated || resources.truncated || ores.truncated || enemySpawns.truncated || buildings.truncated || liquids.truncated;
        return "{\"core_count\":" + count + ",\"cores\":" + cores + ",\"core_teams\":" + teams
            + ",\"tile_layers\":" + tileLayers + ",\"tile_layers_truncated\":" + truncated + "}";
    }

    private static String jsonField(String json, String key, String fallback) {
        String marker = "\"" + key + "\":";
        int start = json.indexOf(marker);
        if (start < 0) return fallback;
        start += marker.length();
        while (start < json.length() && Character.isWhitespace(json.charAt(start))) start++;
        if (start >= json.length()) return fallback;
        char first = json.charAt(start);
        if (first == '{' || first == '[') {
            int depth = 0;
            boolean inString = false;
            boolean escaped = false;
            for (int index = start; index < json.length(); index++) {
                char current = json.charAt(index);
                if (inString) {
                    if (escaped) escaped = false;
                    else if (current == '\\') escaped = true;
                    else if (current == '"') inString = false;
                    continue;
                }
                if (current == '"') inString = true;
                else if (current == '{' || current == '[') depth++;
                else if (current == '}' || current == ']') {
                    if (--depth == 0) return json.substring(start, index + 1);
                }
            }
            return fallback;
        }
        int end = start;
        while (end < json.length() && json.charAt(end) != ',' && json.charAt(end) != '}') end++;
        return end == start ? fallback : json.substring(start, end);
    }

    private static final class JsonArrayBuilder {
        private final int limit;
        private final StringBuilder value = new StringBuilder("[");
        private int count;
        private boolean first = true;
        private boolean truncated;
        private JsonArrayBuilder(int limit) { this.limit = limit; }
        private void add(String item) {
            if (count >= limit) { truncated = true; return; }
            if (!first) value.append(',');
            first = false;
            value.append(item);
            count++;
        }
        @Override public String toString() { return value.append(']').toString(); }
    }

    private static String schematicMetadata(Schematic schematic) {
        return schematicMetadata(schematic, List.of(), -1);
    }

    private static String schematicMetadata(Schematic schematic, List<String> unknownBlocks) {
        return schematicMetadata(schematic, unknownBlocks, -1);
    }

    static String schematicMetadata(Schematic schematic, List<String> unknownBlocks, int formatVersion) {
        Double estimatedBuildTime = estimateBuildTimeSeconds(schematic, unknownBlocks);
        LinkedHashMap<String, Integer> counts = new LinkedHashMap<>();
        StringBuilder positions = new StringBuilder("[");
        boolean firstPosition = true;
        int positionLimit = 10000;
        for (Schematic.Stile tile : schematic.tiles) {
            String name = tile.block == null ? "unknown" : tile.block.name;
            counts.put(name, counts.getOrDefault(name, 0) + 1);
            if (positionLimit-- <= 0) continue;
            if (!firstPosition) positions.append(',');
            firstPosition = false;
            positions.append("{\"block\":").append(quote(name))
                .append(",\"x\":").append(tile.x)
                .append(",\"y\":").append(tile.y)
                .append(",\"rotation\":").append(tile.rotation & 3)
                .append(",\"config\":").append(configValue(tile.config)).append('}');
        }
        positions.append(']');

        StringBuilder blockTypes = new StringBuilder("[");
        boolean firstType = true;
        for (Entry<String, Integer> entry : counts.entrySet()) {
            if (!firstType) blockTypes.append(',');
            firstType = false;
            blockTypes.append("{\"name\":").append(quote(entry.getKey()))
                .append(",\"count\":").append(entry.getValue()).append('}');
        }
        blockTypes.append(']');

        StringBuilder requirements = new StringBuilder("[");
        boolean firstRequirement = true;
        try {
            for (mindustry.type.ItemStack stack : schematic.requirements()) {
                if (!firstRequirement) requirements.append(',');
                firstRequirement = false;
                requirements.append("{\"item\":").append(quote(stack.item.name))
                    .append(",\"amount\":").append(stack.amount).append('}');
            }
        } catch (Throwable ignored) { /* requirements are optional for old files */ }
        requirements.append(']');

        String dependency = schematic.mod == null ? "" : schematic.mod.name;
        String planet = schematic.tags.get("planet", "");
        String labels = schematic.labels == null ? "[]" : stringArray(schematic.labels);
        float production = finite(schematic.powerProduction());
        float consumption = finite(schematic.powerConsumption());
        float net = finite(production - consumption);
        MindustryCompatibilityRegistry.Inference compatibility = MindustryCompatibilityRegistry.infer(schematic, unknownBlocks, formatVersion > 0);
        return "{" +
            "\"name\":" + quote(schematic.name()) +
            ",\"description\":" + quote(schematic.description()) +
            ",\"width\":" + schematic.width +
            ",\"height\":" + schematic.height +
            ",\"blocks\":" + schematic.tiles.size +
            ",\"block_count\":" + schematic.tiles.size +
            ",\"block_types\":" + blockTypes +
            ",\"block_positions\":" + positions +
            ",\"block_positions_truncated\":" + (schematic.tiles.size > 10000) +
            ",\"requirements\":" + requirements +
            ",\"estimated_build_time_seconds\":" + (estimatedBuildTime == null ? "null" : number(estimatedBuildTime)) +
            ",\"estimated_build_time_method\":" + quote(estimatedBuildTime == null ? "unavailable" : "sum_of_block_build_time_ticks_divided_by_60") +
            ",\"production\":" + safeProductionAnalysis(schematic, unknownBlocks) +
            ",\"power_production\":" + number(production) +
            ",\"power_consumption\":" + number(consumption) +
            ",\"net_power\":" + number(net) +
            ",\"planet\":" + quote(planet) +
            ",\"tags\":" + labels +
            ",\"labels\":" + labels +
            ",\"mod_dependencies\":" + stringArray(dependency) +
            ",\"unknown_content\":" + stringArray(unknownBlocks) +
            ",\"schematic_format_version\":" + (formatVersion > 0 ? formatVersion : "null") +
            ",\"parser_runtime\":{\"mindustry_build\":" + Version.build + ",\"renderer_version\":" + quote(VERSION) + "}" +
            ",\"compatibility\":{\"minimum_supported_build\":" + (compatibility.minimumSupportedBuild() == null ? "null" : compatibility.minimumSupportedBuild())
                + ",\"source\":" + quote(compatibility.source()) + ",\"confidence\":" + quote(compatibility.confidence()) + "}" +
            ",\"structure_hash\":" + quote(SchematicFingerprint.exact(schematic)) +
            ",\"normalized_structure_hash\":" + quote(SchematicFingerprint.normalized(schematic)) +
            "}";
    }

    /**
     * Estimates blueprint construction time from the resolved Mindustry content database.
     * Block buildTime is measured in game ticks; 60 ticks make one second. Unknown content
     * makes the total incomplete, so callers receive null instead of a misleading partial sum.
     */
    static Double estimateBuildTimeSeconds(Schematic schematic, List<String> unknownBlocks) {
        if (schematic == null || schematic.tiles.size == 0 || (unknownBlocks != null && !unknownBlocks.isEmpty())) return null;
        double totalTicks = 0d;
        for (Schematic.Stile tile : schematic.tiles) {
            if (tile.block == null || !Float.isFinite(tile.block.buildTime) || tile.block.buildTime <= 0f) return null;
            totalTicks += tile.block.buildTime;
        }
        double seconds = totalTicks / 60d;
        return Double.isFinite(seconds) && seconds > 0d ? seconds : null;
    }

    private static String safeProductionAnalysis(Schematic schematic, List<String> unknownBlocks) {
        try { return productionAnalysis(schematic, unknownBlocks); }
        catch (Throwable error) {
            System.err.println("schematic production analysis unavailable: " + error.getClass().getSimpleName());
            return "null";
        }
    }

    /**
     * Computes a schematic's theoretical, full-load rates from the official
     * v160.2 Block/consumer definitions already loaded by this renderer. The
     * game stores craft times in ticks and liquid flow values per tick; convert
     * those rates to seconds here so persisted metadata has one stable unit.
     */
    static String productionAnalysis(Schematic schematic) {
        return productionAnalysis(schematic, List.of());
    }

    static String productionAnalysis(Schematic schematic, List<String> unknownBlocks) {
        LinkedHashMap<String, double[]> items = new LinkedHashMap<>();
        LinkedHashMap<String, double[]> liquids = new LinkedHashMap<>();
        LinkedHashMap<String, String> itemNames = new LinkedHashMap<>();
        LinkedHashMap<String, String> liquidNames = new LinkedHashMap<>();
        LinkedHashMap<String, Integer> warnings = new LinkedHashMap<>();
        for (String unknownBlock : unknownBlocks) warnings.put("unknown-content:" + unknownBlock, 1);
        double generated = 0d, consumedPower = 0d;
        boolean hasFacility = false;

        int analyzedBlocks = 0;
        for (Schematic.Stile tile : schematic.tiles) {
            if (analyzedBlocks++ >= 10000) {
                warn(warnings, "analysis-truncated", "blueprint");
                break;
            }
            Object block = tile.block;
            if (block == null) {
                hasFacility = true;
                warn(warnings, "unknown-content", "unknown");
                continue;
            }
            String id = stringField(block, "name", "unknown");
            if (isA(block, "OverdriveProjector")) warn(warnings, "boost-not-simulated", id);

            // These classes cannot be assigned a terrain-independent rate.
            if (isA(block, "Drill")) {
                hasFacility = true;
                warn(warnings, "terrain-dependent", id);
                continue;
            }
            if (isA(block, "Pump")) {
                hasFacility = true;
                warn(warnings, "terrain-dependent", id);
                continue;
            }
            if (isA(block, "AttributeCrafter")) {
                hasFacility = true;
                warn(warnings, "environment-dependent", id);
                continue;
            }
            if (isA(block, "ThermalGenerator") || isA(block, "HeatGenerator")) {
                hasFacility = true;
                warn(warnings, "environment-dependent", id);
                continue;
            }

            boolean crafter = isA(block, "GenericCrafter");
            boolean separator = isA(block, "Separator");
            double blockGeneration = numberField(block, "powerProduction", 0d);
            double itemDuration = numberField(block, "itemDuration", Double.NaN);
            double craftTime = numberField(block, "craftTime", Double.NaN);
            if ((crafter || separator) && (!Double.isFinite(craftTime) || craftTime <= 0d)) {
                warn(warnings, "unknown-rate", id);
                continue;
            }
            double craftsPerSecond = crafter || separator ? 60d / craftTime : 0d;
            for (Object consumer : arrayField(block, "consumers")) {
                if (hasType(consumer, "ConsumeItems")) {
                    for (Object stack : arrayField(consumer, "items")) {
                        Object content = field(stack, "item");
                        String contentId = stringField(content, "name", "unknown");
                        double amount = numberField(stack, "amount", 0d);
                        if (crafter || separator) addRate(items, itemNames, contentId, localized(content, contentId), amount * craftsPerSecond, false, 1);
                        else if (blockGeneration > 0d && Double.isFinite(itemDuration) && itemDuration > 0d) addRate(items, itemNames, contentId, localized(content, contentId), amount * 60d / itemDuration, false, 1);
                        else warn(warnings, "unknown-rate", id);
                    }
                } else if (hasType(consumer, "ConsumeLiquid")) {
                    Object content = field(consumer, "liquid");
                    String contentId = stringField(content, "name", "unknown");
                    double amount = numberField(consumer, "amount", 0d);
                    addRate(liquids, liquidNames, contentId, localized(content, contentId), amount * 60d, false, 1);
                } else if (hasType(consumer, "ConsumeLiquids")) {
                    for (Object stack : arrayField(consumer, "liquids")) {
                        Object content = field(stack, "liquid");
                        String contentId = stringField(content, "name", "unknown");
                        double amount = numberField(stack, "amount", 0d);
                        addRate(liquids, liquidNames, contentId, localized(content, contentId), amount * 60d, false, 1);
                    }
                } else if (hasType(consumer, "ConsumePowerDynamic")) {
                    warn(warnings, "unknown-rate", id);
                } else if (hasType(consumer, "ConsumePower")) {
                    double usage = numberField(consumer, "usage", 0d);
                    if (!Double.isFinite(usage) || usage < 0d) warn(warnings, "unknown-rate", id);
                    else consumedPower += usage * 60d;
                } else if (hasType(consumer, "ConsumeItemFilter") || hasType(consumer, "ConsumeLiquidFilter")) {
                    warn(warnings, "unknown-rate", id);
                }
            }

            if (crafter) {
                for (Object stack : arrayField(block, "outputItems")) {
                    Object content = field(stack, "item");
                    String contentId = stringField(content, "name", "unknown");
                    addRate(items, itemNames, contentId, localized(content, contentId), numberField(stack, "amount", 0d) * craftsPerSecond, false, 0);
                }
                for (Object stack : arrayField(block, "outputLiquids")) {
                    Object content = field(stack, "liquid");
                    String contentId = stringField(content, "name", "unknown");
                    addRate(liquids, liquidNames, contentId, localized(content, contentId), numberField(stack, "amount", 0d) * 60d, false, 0);
                }
            } else if (separator) {
                Object[] results = arrayField(block, "results");
                double total = 0d;
                for (Object stack : results) total += numberField(stack, "amount", 0d);
                if (total > 0d) for (Object stack : results) {
                    Object content = field(stack, "item");
                    String contentId = stringField(content, "name", "unknown");
                    double expected = numberField(stack, "amount", 0d) / total * craftsPerSecond;
                    addRate(items, itemNames, contentId, localized(content, contentId), expected, true, 0);
                }
            }

            if (!Double.isFinite(blockGeneration) || blockGeneration < 0d) warn(warnings, "unknown-rate", id);
            else if (blockGeneration > 0d) generated += blockGeneration * 60d;
            Object generatorLiquidOutput = field(block, "outputLiquid");
            if (blockGeneration > 0d && generatorLiquidOutput != null) {
                Object content = field(generatorLiquidOutput, "liquid");
                String contentId = stringField(content, "name", "unknown");
                addRate(liquids, liquidNames, contentId, localized(content, contentId), numberField(generatorLiquidOutput, "amount", 0d) * 60d, false, 0);
            }
            if (crafter || separator || blockGeneration > 0d || consumedPower > 0d) hasFacility = true;
            if (!crafter && !separator && Double.isFinite(blockGeneration) && blockGeneration <= 0d && hasFlag(block, "factory")) {
                warn(warnings, "unknown-rate", id);
                hasFacility = true;
            }
            if (Double.isFinite(blockGeneration) && blockGeneration <= 0d && hasFlag(block, "generator")) {
                warn(warnings, "unknown-rate", id);
                hasFacility = true;
            }
        }

        if (!warnings.isEmpty()) hasFacility = true;
        StringBuilder out = new StringBuilder("{\"mode\":\"theoretical\",\"complete\":").append(warnings.isEmpty());
        out.append(",\"available\":").append(hasFacility);
        out.append(",\"items\":").append(flowJson(items, itemNames));
        out.append(",\"liquids\":").append(flowJson(liquids, liquidNames));
        double netPower = generated - consumedPower;
        out.append(",\"power\":{\"generated\":").append(number(generated)).append(",\"consumed\":").append(number(consumedPower)).append(",\"net\":").append(number(netPower)).append('}');
        out.append(",\"warnings\":[");
        boolean first = true;
        for (Entry<String, Integer> warning : warnings.entrySet()) {
            if (!first) out.append(',');
            first = false;
            String type = warning.getKey().substring(0, warning.getKey().indexOf(':'));
            String blockId = warning.getKey().substring(warning.getKey().indexOf(':') + 1);
            out.append("{\"type\":").append(quote(type)).append(",\"blockId\":").append(quote(blockId)).append(",\"count\":");
            if (type.equals("unknown-content")) out.append("null"); else out.append(warning.getValue());
            if (type.equals("terrain-dependent")) out.append(",\"message\":\"产量依赖地图矿物或地形，未计入\"");
            if (type.equals("environment-dependent")) out.append(",\"message\":\"生产效率依赖地图环境属性，未计入\"");
            out.append('}');
        }
        return out.append("]}").toString();
    }

    /** Reads only the official schematic header, tags and block-name dictionary.
     * Schematics.read() remains the sole decoder for block placements/configs;
     * this bounded pre-scan preserves names that the official reader replaces
     * with air when a matching Mod definition is not installed.
     */
    static List<String> unknownSchematicBlocks(Path input) {
        try (DataInputStream file = new DataInputStream(Files.newInputStream(input))) {
            if (file.readInt() != 0x6d736368) return List.of();
            file.readUnsignedByte();
            try (DataInputStream data = new DataInputStream(new InflaterInputStream(file))) {
                data.readShort(); data.readShort();
                int tagCount = data.readUnsignedByte();
                for (int i = 0; i < tagCount; i++) { data.readUTF(); data.readUTF(); }
                int blockCount = data.readUnsignedByte();
                java.util.LinkedHashSet<String> unknown = new java.util.LinkedHashSet<>();
                for (int i = 0; i < blockCount; i++) {
                    String name = data.readUTF();
                    String mappedName = mindustry.io.SaveFileReader.fallback.get(name, name);
                    Block block = Vars.content.block(mappedName);
                    if (block == null || isA(block, "LegacyBlock")) unknown.add(name);
                }
                return List.copyOf(unknown);
            }
        } catch (Exception ignored) {
            return List.of();
        }
    }

    private static void warn(LinkedHashMap<String, Integer> warnings, String type, String id) {
        String key = type + ":" + id;
        warnings.put(key, warnings.getOrDefault(key, 0) + 1);
    }

    private static void addRate(LinkedHashMap<String, double[]> values, LinkedHashMap<String, String> names, String id, String name, double rate, boolean estimated, int direction) {
        if (id == null || !Double.isFinite(rate) || rate <= 0d) return;
        double[] sums = values.computeIfAbsent(id, ignored -> new double[3]);
        sums[direction] += rate;
        if (estimated) sums[2] = 1d;
        names.putIfAbsent(id, name);
    }

    private static String flowJson(LinkedHashMap<String, double[]> values, LinkedHashMap<String, String> names) {
        StringBuilder result = new StringBuilder("{\"inputs\":[");
        boolean first = true;
        for (Entry<String, double[]> entry : values.entrySet()) {
            double[] stats = entry.getValue();
            double net = stats[0] - stats[1];
            if (net >= -0.0000001d) continue;
            if (!first) result.append(','); first = false;
            result.append("{\"id\":").append(quote(entry.getKey())).append(",\"name\":").append(quote(names.get(entry.getKey()))).append(",\"rate\":").append(number(-net));
            if (stats[2] > 0d) result.append(",\"estimated\":true");
            result.append('}');
        }
        result.append("],\"outputs\":["); first = true;
        for (Entry<String, double[]> entry : values.entrySet()) {
            double[] stats = entry.getValue(); double net = stats[0] - stats[1];
            if (net <= 0.0000001d) continue;
            if (!first) result.append(','); first = false;
            result.append("{\"id\":").append(quote(entry.getKey())).append(",\"name\":").append(quote(names.get(entry.getKey()))).append(",\"rate\":").append(number(net));
            if (stats[2] > 0d) result.append(",\"estimated\":true");
            result.append('}');
        }
        result.append("],\"internal\":["); first = true;
        for (Entry<String, double[]> entry : values.entrySet()) {
            double[] stats = entry.getValue();
            if (stats[0] <= 0d && stats[1] <= 0d) continue;
            if (!first) result.append(','); first = false;
            result.append("{\"id\":").append(quote(entry.getKey())).append(",\"name\":").append(quote(names.get(entry.getKey())))
                .append(",\"produced\":").append(number(stats[0])).append(",\"consumed\":").append(number(stats[1]))
                .append(",\"net\":").append(number(stats[0] - stats[1]));
            if (stats[2] > 0d) result.append(",\"estimated\":true");
            result.append('}');
        }
        return result.append("]}").toString();
    }

    private static Object field(Object target, String name) {
        if (target == null) return null;
        try { return target.getClass().getField(name).get(target); }
        catch (ReflectiveOperationException ignored) { return null; }
    }
    private static boolean isA(Object value, String simpleName) { return value != null && hasType(value, simpleName); }
    private static boolean hasType(Object value, String simpleName) {
        for (Class<?> type = value == null ? null : value.getClass(); type != null; type = type.getSuperclass()) {
            if (type.getSimpleName().equals(simpleName)) return true;
        }
        return false;
    }
    private static boolean hasFlag(Object block, String flag) {
        Object flags = field(block, "flags");
        return flags != null && flags.toString().contains(flag);
    }
    private static Object[] arrayField(Object target, String name) {
        Object value = field(target, name);
        return value != null && value.getClass().isArray() ? (Object[])value : new Object[0];
    }
    private static double numberField(Object target, String name, double fallback) {
        Object value = field(target, name);
        return value instanceof Number ? ((Number)value).doubleValue() : fallback;
    }
    private static String stringField(Object target, String name, String fallback) {
        Object value = field(target, name);
        return value instanceof String ? (String)value : fallback;
    }
    private static String localized(Object content, String fallback) {
        return stringField(content, "localizedName", fallback);
    }

    private static String rulesJson(mindustry.game.Rules rules) {
        if (rules == null) return "{}";
        return "{\"waves\":" + rules.waves +
            ",\"wave_timer\":" + rules.waveTimer +
            ",\"wave_sending\":" + rules.waveSending +
            ",\"attack_mode\":" + rules.attackMode +
            ",\"pvp\":" + rules.pvp +
            ",\"infinite_resources\":" + rules.infiniteResources +
            ",\"schematics_allowed\":" + rules.schematicsAllowed +
            ",\"unit_cap\":" + rules.unitCap +
            ",\"disable_unit_cap\":" + rules.disableUnitCap +
            ",\"wave_spacing\":" + number(rules.waveSpacing) +
            ",\"planet\":" + quote(rules.planet == null ? "" : rules.planet.name) + "}";
    }

    private static String spawnGroupsJson(mindustry.game.Rules rules) {
        if (rules == null || rules.spawns == null) return "[]";
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        for (mindustry.game.SpawnGroup group : rules.spawns) {
            if (!first) result.append(',');
            first = false;
            result.append("{\"unit\":").append(quote(group.type == null ? "" : group.type.name))
                .append(",\"begin\":").append(group.begin)
                .append(",\"end\":").append(group.end)
                .append(",\"spacing\":").append(group.spacing)
                .append(",\"amount\":").append(group.unitAmount)
                .append(",\"unit_health\":").append(number(group.type == null ? 0d : group.type.health))
                .append(",\"shields\":").append(number(group.shields))
                .append(",\"flying\":").append(group.type != null && group.type.flying)
                .append(",\"boss\":").append(group.effect != null && "boss".equals(group.effect.name))
                .append(",\"team\":").append(quote(group.team == null ? "" : group.team.name)).append('}');
        }
        return result.append(']').toString();
    }

    private static String contentNames(Iterable<mindustry.world.Block> blocks) {
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        if (blocks != null) for (mindustry.world.Block block : blocks) {
            if (!first) result.append(',');
            first = false;
            result.append(quote(block.name));
        }
        return result.append(']').toString();
    }

    private static String unitNames(Iterable<mindustry.type.UnitType> units) {
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        if (units != null) for (mindustry.type.UnitType unit : units) {
            if (!first) result.append(',');
            first = false;
            result.append(quote(unit.name));
        }
        return result.append(']').toString();
    }

    private static String teamNames(Map map) {
        StringBuilder result = new StringBuilder();
        boolean[] first = {true};
        if (map.teams != null) map.teams.each(id -> {
            mindustry.game.Team team = mindustry.game.Team.get(id);
            if (team != null) {
                if (!first[0]) result.append(',');
                first[0] = false;
                result.append(team.name);
            }
        });
        return result.toString();
    }

    private static String joinMapTags(Map map) {
        StringBuilder result = new StringBuilder();
        boolean first = true;
        try {
            for (String tag : map.extraTags()) {
                if (tag == null || tag.isBlank()) continue;
                if (!first) result.append(',');
                first = false;
                result.append(tag);
            }
        } catch (Throwable ignored) { /* old map formats may not have extra tags */ }
        return result.toString();
    }

    private static String configValue(Object config) {
        if (config == null) return "null";
        if (config instanceof String) return quote((String)config);
        try { return new Json().toJson(config); }
        catch (Throwable ignored) { return quote(String.valueOf(config)); }
    }

    private static float finite(float value) { return Float.isFinite(value) ? value : 0f; }
    private static String number(float value) { return Float.isFinite(value) ? Float.toString(value) : "null"; }
    private static String number(double value) { return Double.isFinite(value) ? Double.toString(value) : "null"; }
    private static String stringArray(String value) {
        if (value == null || value.isBlank()) return "[]";
        String[] values = value.split(",");
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        for (String item : values) {
            if (item.isBlank()) continue;
            if (!first) result.append(',');
            first = false;
            result.append(quote(item.trim()));
        }
        return result.append(']').toString();
    }

    private static String stringArray(List<String> values) {
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        for (String value : values) {
            if (!first) result.append(',');
            first = false;
            result.append(quote(value));
        }
        return result.append(']').toString();
    }
    private static String stringArray(arc.struct.Seq<String> values) {
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        if (values != null) for (String value : values) {
            if (value == null || value.isBlank()) continue;
            if (!first) result.append(',');
            first = false;
            result.append(quote(value));
        }
        return result.append(']').toString();
    }

    /** Draw a block sprite at the atlas region's native world size, as Mindustry does for plans. */
    private static void drawSchematicTile(BufferedImage target, Schematic.Stile tile, int height, int tileSize, int padding) {
        int tileX = padding + tile.x * tileSize;
        int tileY = padding + (height - tile.y - 1) * tileSize;
        // Even-sized Mindustry blocks use a half-tile world offset. Apply it
        // on both axes; image Y is inverted relative to world Y.
        int blockOffset = Math.round(tile.block.offset * tileSize / Vars.tilesize);
        int centerX = tileX + tileSize / 2 + blockOffset;
        int centerY = tileY + tileSize / 2 - blockOffset;
        BufferedImage sprite = spriteAtlas == null ? null : spriteAtlas.findBlock(tile.block);
        Graphics2D graphics = target.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
        if (sprite == null) {
            // Keep previews useful if an asset bundle is unavailable or a future block is unknown.
            int size = Math.max(1, tile.block.size) * tileSize;
            int x = centerX - size / 2;
            int y = centerY - size / 2;
            graphics.setColor(new Color(tile.block.mapColor.r, tile.block.mapColor.g, tile.block.mapColor.b, tile.block.mapColor.a));
            graphics.fillRect(x, y, size, size);
            graphics.setColor(new Color(255, 255, 255, 70));
            graphics.drawRect(x, y, Math.max(0, size - 1), Math.max(0, size - 1));
        } else {
            // The desktop atlas is packed at 4x the game's 8px world tile size.
            // Preserve the region's own aspect ratio and any intentional overhang;
            // forcing every region into block.size x block.size stretches some sprites.
            int spriteWidth = Math.max(1, Math.round(sprite.getWidth() * tileSize / 32f));
            int spriteHeight = Math.max(1, Math.round(sprite.getHeight() * tileSize / 32f));
            AffineTransform original = graphics.getTransform();
            graphics.translate(centerX, centerY);
            if (tile.block.rotate && tile.block.rotateDraw) {
                graphics.rotate(Math.toRadians((tile.rotation & 3) * 90));
            }
            graphics.drawImage(sprite, -spriteWidth / 2, -spriteHeight / 2, spriteWidth, spriteHeight, null);
            graphics.setTransform(original);
        }
        graphics.dispose();
    }

    private static String previewKey(String kind, String hash) { return "resources/" + kind + "/" + hash.substring(0, 2) + "/" + hash + "/preview.png"; }

    static BufferedImage composeLayers(List<BufferedImage> layers) {
        if (layers.isEmpty()) return null;
        int width = 0, height = 0;
        for (BufferedImage layer : layers) {
            width = Math.max(width, layer.getWidth());
            height = Math.max(height, layer.getHeight());
        }
        BufferedImage composite = new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB);
        Graphics2D graphics = composite.createGraphics();
        for (BufferedImage layer : layers) {
            graphics.drawImage(layer, (width - layer.getWidth()) / 2, (height - layer.getHeight()) / 2, null);
        }
        graphics.dispose();
        return composite;
    }

    private static Path target(String key) throws IOException {
        Path result = storageRoot.resolve(key).normalize();
        if (!result.startsWith(storageRoot)) throw new IOException("preview path escaped storage root");
        Files.createDirectories(result.getParent());
        return result;
    }
    private static String result(String metadata, String key) { return "{\"metadata\":" + metadata + ",\"previewKey\":" + quote(key) + ",\"parserVersion\":\"mindfourm-renderer-" + VERSION + "\"}"; }
    private static boolean authorized(HttpExchange exchange) { return token.isEmpty() || ("Bearer " + token).equals(exchange.getRequestHeaders().getFirst("Authorization")); }
    private static byte[] readLimited(HttpExchange exchange, int limit) throws IOException { try (var input = exchange.getRequestBody()) { byte[] bytes = input.readNBytes(limit + 1); if (bytes.length > limit) throw new IOException("request too large"); return bytes; } }
    private static void send(HttpExchange exchange, int status, String body) throws IOException { byte[] bytes = body.getBytes(StandardCharsets.UTF_8); exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8"); exchange.sendResponseHeaders(status, bytes.length); try (OutputStream output = exchange.getResponseBody()) { output.write(bytes); } }
    private static String error(String code) { return "{\"errorCode\":" + quote(code) + "}"; }
    private static String quote(String value) { StringBuilder result = new StringBuilder("\""); for (char character : value.toCharArray()) { switch (character) { case '\\' -> result.append("\\\\"); case '\"' -> result.append("\\\""); case '\n' -> result.append("\\n"); case '\r' -> result.append("\\r"); default -> result.append(character); } } return result.append('\"').toString(); }
    private static String env(String name, String fallback) { String value = System.getenv(name); return value == null || value.isBlank() ? fallback : value; }

    /** Loads Mindustry's desktop atlas directly, so the headless worker does not need OpenGL. */
    private static final class SpriteAtlas {
        private final HashMap<String, BufferedImage> regions;
        private final Path assetsRoot;

        private SpriteAtlas(HashMap<String, BufferedImage> regions, Path assetsRoot) {
            this.regions = regions;
            this.assetsRoot = assetsRoot;
        }

        static SpriteAtlas load(String configuredRoot) {
            if (configuredRoot == null || configuredRoot.isBlank()) return null;
            Path root = Path.of(configuredRoot).toAbsolutePath().normalize();
            Path atlasPath = root.resolve("sprites/sprites.aatls");
            if (!Files.isRegularFile(atlasPath)) atlasPath = root.resolve("sprites.aatls");
            if (!Files.isRegularFile(atlasPath)) {
                System.err.println("texture assets not found at " + root + "; schematic previews will use fallback colors");
                return null;
            }
            try (DataInputStream input = new DataInputStream(Files.newInputStream(atlasPath))) {
                byte[] header = input.readNBytes(5);
                if (header.length != 5 || header[0] != 'A' || header[1] != 'A' || header[2] != 'T' || header[3] != 'L' || header[4] != 'S') throw new IOException("invalid AATLS header");
                input.readUnsignedShort();
                HashMap<String, BufferedImage> regions = new HashMap<>();
                boolean firstPage = true;
                while (input.available() > 0) {
                    if (!firstPage) input.readUnsignedByte();
                    firstPage = false;
                    String imageName = input.readUTF();
                    input.readUnsignedShort();
                    input.readUnsignedShort();
                    input.readUnsignedByte();
                    input.readUnsignedByte();
                    input.readUnsignedByte();
                    input.readUnsignedByte();
                    int count = input.readInt();
                    BufferedImage page = readPage(root, imageName);
                    for (int index = 0; index < count; index++) {
                        String name = input.readUTF();
                        int left = input.readShort();
                        int top = input.readShort();
                        int width = input.readShort();
                        int height = input.readShort();
                        if (input.readBoolean()) input.skipBytes(8);
                        if (input.readBoolean()) input.skipBytes(8);
                        if (input.readBoolean()) input.skipBytes(8);
                        if (page != null && width > 0 && height > 0 && left >= 0 && top >= 0 && left + width <= page.getWidth() && top + height <= page.getHeight()) {
                            regions.put(name, page.getSubimage(left, top, width, height));
                        }
                    }
                }
                System.out.println("loaded " + regions.size() + " Mindustry sprite regions from " + root);
                return new SpriteAtlas(regions, root);
            } catch (Exception exception) {
                exception.printStackTrace(System.err);
                return null;
            }
        }

        private static BufferedImage readPage(Path root, String imageName) throws IOException {
            Path page = root.resolve("sprites").resolve(imageName).normalize();
            if (!Files.isRegularFile(page)) page = root.resolve(imageName).normalize();
            return Files.isRegularFile(page) ? ImageIO.read(page.toFile()) : null;
        }

        BufferedImage find(String name) {
            BufferedImage sprite = regions.get(name);
            if (sprite == null) sprite = regions.get(name + "-bottom");
            return sprite == null ? regions.get(name + "-top") : sprite;
        }

        /**
         * Resolve schematic icons from Mindustry's generated icon composition.
         * The desktop build pre-generates `block-*-full` by drawing
         * Block.getGeneratedIcons() in order; use that official composite when
         * present, otherwise compose those same region names from the atlas.
         */
        BufferedImage findBlock(mindustry.world.Block block) {
            BufferedImage full = regions.get("block-" + block.name + "-full");
            if (full != null) return full;
            // The generated UI icon is also composed by the official asset
            // generator and remains available in headless mode. Prefer it to
            // calling block.icons(), which can require Core.atlas at runtime.
            BufferedImage uiIcon = regions.get("block-" + block.name + "-ui");
            if (uiIcon != null) return uiIcon;
            arc.graphics.g2d.TextureRegion[] iconLayers;
            try {
                iconLayers = block.getGeneratedIcons();
            } catch (RuntimeException | LinkageError unavailableInHeadlessRuntime) {
                return find(block.name);
            }
            if (iconLayers != null && iconLayers.length > 0) {
                java.util.ArrayList<BufferedImage> layers = new java.util.ArrayList<>();
                for (arc.graphics.g2d.TextureRegion layer : iconLayers) {
                    if (!(layer instanceof arc.graphics.g2d.TextureAtlas.AtlasRegion atlasLayer) || atlasLayer.name == null) continue;
                    BufferedImage image = regions.get(atlasLayer.name);
                    if (image != null) layers.add(image);
                }
                if (!layers.isEmpty()) {
                    return composeLayers(layers);
                }
            }
            return find(block.name);
        }

        BufferedImage findItem(String name) {
            BufferedImage sprite = regions.get("item-" + name + "-ui");
            return sprite == null ? regions.get("item-" + name) : sprite;
        }

        BufferedImage findLiquid(String name) {
            BufferedImage sprite = regions.get("liquid-" + name + "-ui");
            return sprite == null ? regions.get("liquid-" + name) : sprite;
        }

        BufferedImage findBlock(String name) {
            BufferedImage sprite = regions.get("block-" + name + "-ui");
            return sprite == null ? find(name) : sprite;
        }

        BufferedImage standalone(String name) {
            try {
                Path file = assetsRoot.resolve("sprites").resolve(name).normalize();
                if (!Files.isRegularFile(file)) file = assetsRoot.resolve(name).normalize();
                return Files.isRegularFile(file) ? ImageIO.read(file.toFile()) : null;
            } catch (IOException exception) {
                return null;
            }
        }
    }
}
