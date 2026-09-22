package cn.mdtbbs.renderer;

import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.graphics.Pixmap;
import arc.graphics.PixmapIO;
import arc.util.serialization.JsonReader;
import arc.util.serialization.JsonValue;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import mindustry.Vars;
import mindustry.core.Platform;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import mindustry.io.MapIO;
import mindustry.maps.Map;
import mindustry.net.Net;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.DataInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map.Entry;
import java.util.HexFormat;
import java.util.concurrent.Executors;

/**
 * Restricted local renderer.  It never loads mods or connects to a client: it
 * only uses official MapIO/Schematics readers and writes a derived PNG.
 */
public final class MapRenderer {
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final String VERSION = "v160.2";
    private static final JsonReader JSON = new JsonReader();
    private static Path storageRoot;
    private static String token;
    private static SpriteAtlas spriteAtlas;

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

    private static void initialize() {
        Vars.headless = true;
        Core.settings.setDataDirectory(new Fi(storageRoot.resolve("worker-config").toFile()));
        Vars.loadSettings();
        Vars.init();
        Vars.content.createBaseContent();
        Vars.content.init();
        spriteAtlas = SpriteAtlas.load(env("ASSETS_ROOT", ""));
    }

    private static void start() throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(env("WORKER_HOST", "127.0.0.1"), Integer.parseInt(env("WORKER_PORT", "6100"))), 8);
        server.createContext("/health", MapRenderer::health);
        server.createContext("/v1/analyze", MapRenderer::analyze);
        server.setExecutor(Executors.newSingleThreadExecutor());
        server.start();
        System.out.println("MindFourm renderer listening on loopback");
    }

    private static void health(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        send(exchange, 200, "{\"status\":\"ok\",\"mindustryVersion\":\"" + VERSION + "\",\"textureAssets\":" + (spriteAtlas != null) + "}");
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

    private static void renderMap(HttpExchange exchange, Path input, String hash) throws IOException {
        Map map = MapIO.createMap(new Fi(input.toFile()), true);
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
        send(exchange, 200, result(mapMetadata(map, tilesLoaded), key));
    }

    private static void renderSchematic(HttpExchange exchange, Path input, String hash) throws IOException {
        Schematic schematic = Schematics.read(new Fi(input.toFile()));
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
        String key = previewKey("schematic", hash);
        if (!ImageIO.write(image, "png", target(key).toFile())) throw new IOException("PNG writer unavailable");
        send(exchange, 200, result(schematicMetadata(schematic), key));
    }

    /**
     * MapIO exposes the map header and Rules object without exposing the tile
     * grid.  Report only values that come from those objects.  In particular,
     * build 1 is the default used by older readers when the file carries no
     * reliable Mindustry build marker, so it is deliberately returned as null.
     */
    private static String mapMetadata(Map map, boolean tilesLoaded) {
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
        String build = map.build > 1 ? Integer.toString(map.build) : "null";
        return "{" +
            "\"name\":" + quote(map.tags.get("name", "")) +
            ",\"author\":" + quote(map.tags.get("author", "")) +
            ",\"description\":" + quote(map.tags.get("description", "")) +
            ",\"width\":" + map.width +
            ",\"height\":" + map.height +
            ",\"spawns\":" + map.spawns +
            ",\"version\":" + map.version +
            ",\"build\":" + build +
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
            "}";
    }

    private static String mapTileMetadata(Map map, boolean tilesLoaded) {
        if (!tilesLoaded || Vars.world == null || Vars.world.tiles == null || Vars.world.tiles.width != map.width || Vars.world.tiles.height != map.height) {
            return "{\"core_count\":0,\"cores\":[],\"core_teams\":[]}";
        }
        StringBuilder cores = new StringBuilder("[");
        StringBuilder teams = new StringBuilder("[");
        java.util.HashSet<String> coreTeams = new java.util.HashSet<>();
        int[] count = {0};
        boolean[] firstCore = {true};
        for (mindustry.world.Tile tile : Vars.world.tiles) {
            if (!(tile.build instanceof mindustry.world.blocks.storage.CoreBlock.CoreBuild)) continue;
            mindustry.game.Team team = tile.team();
            String teamName = team == null ? "" : team.name;
            if (!firstCore[0]) cores.append(',');
            firstCore[0] = false;
            cores.append("{\"x\":").append(tile.x).append(",\"y\":").append(tile.y)
                .append(",\"team\":").append(quote(teamName)).append('}');
            coreTeams.add(teamName);
            count[0]++;
        }
        boolean firstTeam = true;
        for (String team : coreTeams) {
            if (!firstTeam) teams.append(',');
            firstTeam = false;
            teams.append(quote(team));
        }
        return "{\"core_count\":" + count[0] + ",\"cores\":" + cores.append(']') + ",\"core_teams\":" + teams.append(']') + "}";
    }

    private static String jsonField(String json, String key, String fallback) {
        String marker = "\"" + key + "\":";
        int start = json.indexOf(marker);
        if (start < 0) return fallback;
        start += marker.length();
        int end = json.indexOf(',', start);
        if (end < 0) end = json.indexOf('}', start);
        return end < 0 ? fallback : json.substring(start, end);
    }

    private static String schematicMetadata(Schematic schematic) {
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
            ",\"power_production\":" + number(production) +
            ",\"power_consumption\":" + number(consumption) +
            ",\"net_power\":" + number(net) +
            ",\"planet\":" + quote(planet) +
            ",\"tags\":" + labels +
            ",\"labels\":" + labels +
            ",\"mod_dependencies\":" + stringArray(dependency) +
            "}";
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
        if (config instanceof Number || config instanceof Boolean) return String.valueOf(config);
        return quote(String.valueOf(config));
    }

    private static float finite(float value) { return Float.isFinite(value) ? value : 0f; }
    private static String number(float value) { return Float.isFinite(value) ? Float.toString(value) : "null"; }
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

    /** Draw a client-identical block sprite when the official desktop atlas is installed. */
    private static void drawSchematicTile(BufferedImage target, Schematic.Stile tile, int height, int tileSize, int padding) {
        int size = Math.max(1, tile.block.size) * tileSize;
        int x = padding + tile.x * tileSize - (size - tileSize) / 2;
        int y = padding + (height - tile.y - 1) * tileSize - (size - tileSize) / 2;
        BufferedImage sprite = spriteAtlas == null ? null : spriteAtlas.find(tile.block.name);
        Graphics2D graphics = target.createGraphics();
        graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_NEAREST_NEIGHBOR);
        if (sprite == null) {
            // Keep previews useful if an asset bundle is unavailable or a future block is unknown.
            graphics.setColor(new Color(tile.block.mapColor.r, tile.block.mapColor.g, tile.block.mapColor.b, tile.block.mapColor.a));
            graphics.fillRect(x, y, size, size);
            graphics.setColor(new Color(255, 255, 255, 70));
            graphics.drawRect(x, y, Math.max(0, size - 1), Math.max(0, size - 1));
        } else {
            AffineTransform original = graphics.getTransform();
            graphics.translate(x + size / 2.0, y + size / 2.0);
            graphics.rotate(Math.toRadians((tile.rotation & 3) * 90));
            graphics.drawImage(sprite, -size / 2, -size / 2, size, size, null);
            graphics.setTransform(original);
        }
        graphics.dispose();
    }

    private static String previewKey(String kind, String hash) { return "resources/" + kind + "/" + hash.substring(0, 2) + "/" + hash + "/preview.png"; }
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
