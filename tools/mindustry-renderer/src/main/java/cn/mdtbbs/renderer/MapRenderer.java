package cn.mdtbbs.renderer;

import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.graphics.Pixmap;
import arc.graphics.PixmapIO;
import arc.util.serialization.JsonReader;
import arc.util.serialization.JsonValue;
import arc.util.serialization.JsonWriter;
import arc.util.serialization.Json;
import arc.util.io.Reads;
import arc.util.io.Writes;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import mindustry.Vars;
import mindustry.core.Logic;
import mindustry.core.Platform;
import mindustry.core.Version;
import mindustry.editor.EditorTile;
import mindustry.ctype.ContentType;
import mindustry.ctype.Content;
import mindustry.ctype.UnlockableContent;
import mindustry.entities.units.BuildPlan;
import mindustry.game.Schematic;
import mindustry.game.Schematics;
import mindustry.io.MapIO;
import mindustry.io.SaveIO;
import mindustry.io.SaveMeta;
import mindustry.io.SaveVersion;
import mindustry.maps.Map;
import mindustry.net.Net;
import mindustry.world.Block;
import mindustry.world.blocks.environment.Floor;
import mindustry.world.blocks.environment.OverlayFloor;
import mindustry.world.blocks.logic.LogicBlock;
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
import java.io.DataOutputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStreamReader;
import java.util.zip.DeflaterOutputStream;
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
import java.util.zip.InflaterInputStream;

/**
 * Restricted local renderer.  It never loads mods or connects to a client: it
 * only uses official MapIO/Schematics readers and writes a derived PNG.
 */
public final class MapRenderer {
    private static final int MAX_MAP_LAYER_ITEMS = 40_000;
    private static final int MAX_MAP_TILE_AREA = 2_000_000;
    private static final int MAX_SCHEMATIC_TILES = 16_384;
    private static final int MAX_BYTES = 20 * 1024 * 1024;
    private static final long MAX_INFLATED_MAP_BYTES = 128L * 1024 * 1024;
    private static final long MAX_INFLATED_SCHEMATIC_BYTES = 16L * 1024 * 1024;
    private static final int PROTOCOL_VERSION = 2;
    private static final String VERSION = "v160.5-preview-9-standalone-editors";
    private static final String MINDUSTRY_SERVER_SHA256 = "0bd327c6c3d551e7e8fdab7b695517f809baacca3b1f5cb1c1a8dd74836620e0";
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
        server.createContext("/v2/transform-schematic", MapRenderer::transformSchematic);
        server.createContext("/v2/transform-map", MapRenderer::transformMap);
        server.createContext("/v1/content-metadata", MapRenderer::contentMetadata);
        server.createContext("/v1/content-catalog", MapRenderer::contentCatalog);
        server.createContext("/v1/create-schematic", MapRenderer::createSchematic);
        server.createContext("/v1/create-map", MapRenderer::createMap);

        server.createContext("/v2/editor-catalog", MapRenderer::editorCatalog);
        server.createContext("/v2/map-region", MapRenderer::mapRegion);
        server.setExecutor(Executors.newSingleThreadExecutor());
        server.start();
        System.out.println("MindFourm renderer listening on loopback");
    }

    private static void health(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        send(exchange, 200, healthMetadata());
    }

    static String healthMetadata() {
        return "{\"status\":\"ok\",\"protocolVersion\":" + PROTOCOL_VERSION
            + ",\"rendererVersion\":" + quote(VERSION)
            + ",\"buildDigest\":" + quote(rendererBuildDigest())
            + ",\"runtime\":{\"name\":\"Mindustry\",\"version\":\"v160.5\",\"build\":" + Version.build
            + ",\"artifactSha256\":" + quote(MINDUSTRY_SERVER_SHA256) + "}"
            + ",\"supportedOperations\":[\"content.catalog\",\"schematic.create\",\"schematic.read\",\"schematic.write\",\"schematic.config.read\",\"schematic.config.write\",\"schematic.logic.read\",\"schematic.logic.text.write\",\"map.create\",\"map.read\",\"map.write\",\"map.rules.read\",\"map.rules.write\",\"map.objects.read\",\"map.objects.write\",\"map.waves.read\",\"map.waves.write\",\"editor.catalog\",\"schematic.copy.write\",\"map.region.read\",\"map.objects.rotate\"]"
            + ",\"textureAssets\":" + (spriteAtlas != null) + "}";
    }

    /** Hashes the compiled entry class so health reports the running worker build, not just its source label. */
    private static String rendererBuildDigest() {
        try (var input = MapRenderer.class.getResourceAsStream("MapRenderer.class")) {
            if (input == null) return "unavailable";
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.readAllBytes()));
        } catch (Exception ignored) {
            return "unavailable";
        }
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

    /** Complete pinned vanilla catalog; clients can build palettes without maintaining a content list. */
    private static void contentCatalog(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        try {
            StringBuilder result = new StringBuilder("{\"blocks\":");
            result.append(contentCatalogEntries(ContentType.block));
            result.append(",\"items\":").append(contentCatalogEntries(ContentType.item));
            result.append(",\"liquids\":").append(contentCatalogEntries(ContentType.liquid));
            result.append(",\"units\":").append(contentCatalogEntries(ContentType.unit));
            result.append(",\"statuses\":").append(contentCatalogEntries(ContentType.status));
            result.append(",\"teams\":").append(teamCatalogEntries());
            result.append(",\"rule_defaults\":").append(ruleDefaultsJson()).append('}');
            send(exchange, 200, result.toString());
        } catch (Exception exception) {
            send(exchange, 503, error("CONTENT_CATALOG_UNAVAILABLE"));
        }
    }

    private static String ruleDefaultsJson() {
        JsonValue source = JSON.parse(mindustry.io.JsonIO.write(new mindustry.game.Rules()));
        String[] keys = {"allowEditRules", "infiniteResources", "coreBuildAndConfig", "waveTimer", "waveSending", "waves", "airUseSpawns", "wavesSpawnAtCores", "pvp", "pvpAutoPause", "pauseDisabled", "waitEnemies", "attackMode", "editor", "derelictRepair", "canGameOver", "coreCapture", "reactorExplosions", "possessionAllowed", "schematicsAllowed", "damageExplosions", "fire", "randomWaveAI", "unitPayloadUpdate", "unitPayloadsExplode", "unitCapVariable", "hideSpawns", "ghostBlocks", "showOtherTeamPings", "logicUnitControl", "logicUnitBuild", "logicUnitDeconstruct", "worldProcessorPlayerLink", "allowEditWorldProcessors", "disableWorldProcessors", "polygonCoreProtection", "placeRangeCheck", "cleanupDeadTeams", "onlyDepositCore", "allowCoreUnloaders", "coreDestroyClear", "hideBannedBlocks", "allowEnvironmentDeconstruct", "instantBuild", "blockWhitelist", "unitWhitelist", "disableUnitCap", "lighting", "unitCap", "winWave", "environment", "solarMultiplier", "unitBuildSpeedMultiplier", "unitCostMultiplier", "unitDamageMultiplier", "unitHealthMultiplier", "unitCrashDamageMultiplier", "unitMineSpeedMultiplier", "unitFactoryActivationDelay", "blockHealthMultiplier", "blockDamageMultiplier", "buildCostMultiplier", "buildSpeedMultiplier", "deconstructRefundMultiplier", "enemyCoreBuildRadius", "dropZoneRadius", "waveSpacing", "initialWaveSpacing", "itemDepositCooldown", "modeName", "bannedBlocks", "bannedUnits"};
        StringBuilder result = new StringBuilder("{");
        boolean first = true;
        for (String key : keys) {
            JsonValue value = source.get(key);
            if (value == null) continue;
            if (!first) result.append(',');
            first = false;
            result.append(quote(key)).append(':').append(value.toString());
        }
        return result.append('}').toString();
    }

    private static String contentCatalogEntries(ContentType type) throws IOException {
        StringBuilder result = new StringBuilder("[");
        boolean first = true;
        for (Content content : Vars.content.getBy(type)) {
            if (!(content instanceof UnlockableContent unlockable) || unlockable.name == null) continue;
            if (type == ContentType.block && (isA(content, "LegacyBlock") || "air".equals(unlockable.name))) continue;
            if (!first) result.append(',');
            first = false;
            String id = unlockable.name;
            BufferedImage icon = contentIcon(type, id);
            String iconData = "null";
            if (icon != null) {
                ByteArrayOutputStream png = new ByteArrayOutputStream();
                ImageIO.write(icon, "png", png);
                iconData = quote("data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray()));
            }
            String displayName = localized(unlockable, id);
            result.append("{\"internal_name\":").append(quote(id))
                .append(",\"display_name\":").append(quote(displayName))
                .append(",\"icon\":").append(iconData);
            if (content instanceof Block block) {
                Floor floor = block instanceof Floor value ? value : null;
                String category = block.category == null ? "other" : block.category.name();
                result.append(",\"size\":").append(Math.max(1, block.size))
                    .append(",\"size_offset\":").append(block.sizeOffset)
                    .append(",\"category\":").append(quote(category))
                    .append(",\"category_name\":").append(quote(localizedCategory(category)))
                    .append(",\"placeable\":").append(!block.isFloor() && block.newBuilding() != null)
                    .append(",\"has_config\":").append(block.configurations != null && block.configurations.size > 0)
                    .append(",\"logic\":").append(block instanceof LogicBlock)
                    .append(",\"core\":").append(block instanceof mindustry.world.blocks.storage.CoreBlock)
                    .append(",\"spawn\":").append(isA(block, "SpawnBlock"))
                    .append(",\"floor\":").append(block.isFloor())
                    .append(",\"overlay\":").append(block instanceof OverlayFloor)
                    .append(",\"rotatable\":").append(block.rotate)
                    .append(",\"ore\":").append(floor != null && floor.wallOre && floor.itemDrop != null)
                    .append(",\"liquid_floor\":").append(floor != null && floor.liquidDrop != null);
                if (block.configurations != null && block.configurations.size > 0) {
                    result.append(",\"config_types\":").append(schematicConfigTypesJson(block));
                }
            }
            result.append('}');
        }
        return result.append(']').toString();
    }

    private static void createSchematic(HttpExchange exchange) throws IOException {
        createBlankEditorFile(exchange, "schematic");
    }

    private static void createMap(HttpExchange exchange) throws IOException {
        createBlankEditorFile(exchange, "map");
    }

    private static void createBlankEditorFile(HttpExchange exchange, String kind) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        Path output = null;
        try {
            JsonValue request = JSON.parse(new String(readLimited(exchange, 8 * 1024), StandardCharsets.UTF_8));
            JsonValue widthValue = request.get("width"), heightValue = request.get("height"), nameValue = request.get("name");
            if (widthValue == null || !widthValue.isNumber() || widthValue.asDouble() != widthValue.asInt()
                || heightValue == null || !heightValue.isNumber() || heightValue.asDouble() != heightValue.asInt()
                || nameValue == null || !nameValue.isString()) {
                send(exchange, 400, error("INVALID_EDITOR_FILE")); return;
            }
            int width = widthValue.asInt(), height = heightValue.asInt();
            String name = nameValue.asString().trim();
            String floorName = request.getString("floor", "stone");
            String template = request.getString("template", "survival");
            if (name.isEmpty() || name.length() > 120 || name.chars().anyMatch(Character::isISOControl)
                || ("schematic".equals(kind) && (width < 1 || height < 1 || width > 128 || height > 128 || (long)width * height > MAX_SCHEMATIC_TILES))
                || ("map".equals(kind) && (!isSafeMapSize(width, height)
                    || floorName == null || !floorName.matches("[a-zA-Z0-9_.:-]{1,191}")
                    || !java.util.Set.of("survival", "sandbox", "attack", "pvp", "custom").contains(template)))) {
                send(exchange, 400, error("INVALID_EDITOR_FILE")); return;
            }
            Path inputs = storageRoot.resolve("worker-input").normalize();
            Files.createDirectories(inputs);
            output = Files.createTempFile(inputs, "blank-" + kind + "-", "schematic".equals(kind) ? ".msch" : ".msav");
            byte[] bytes = "schematic".equals(kind)
                ? createBlankSchematicBytes(width, height, name)
                : createBlankMapBytes(output, width, height, name, floorName, template);
            if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IOException("generated file exceeds the size limit");
            send(exchange, 200, "{\"dataBase64\":" + quote(Base64.getEncoder().encodeToString(bytes))
                + ",\"sha256\":" + quote(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes))) + "}");
        } catch (Exception exception) {
            send(exchange, 422, error("INVALID_EDITOR_FILE"));
        } finally {
            if (output != null) Files.deleteIfExists(output);
        }
    }

    static byte[] createBlankSchematicBytes(int width, int height, String name) throws IOException, SchematicTransformException {
        if (width < 1 || height < 1 || width > 128 || height > 128 || (long)width * height > MAX_SCHEMATIC_TILES
            || name == null || name.isBlank() || name.length() > 120) throw new SchematicTransformException("INVALID_SCHEMATIC_SIZE");
        StringMap tags = new StringMap();
        tags.put("name", name);
        Schematic schematic = new Schematic(new Seq<>(), tags, width, height);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        Schematics.write(schematic, output);
        byte[] bytes = output.toByteArray();
        Schematic roundTrip = Schematics.read(new ByteArrayInputStream(bytes));
        validateSchematicSize(roundTrip);
        if (roundTrip.width != width || roundTrip.height != height || roundTrip.tiles.size != 0) throw new IOException("schematic round-trip failed");
        return bytes;
    }

    static byte[] createBlankMapBytes(Path output, int width, int height, String name) throws Exception {
        return createBlankMapBytes(output, width, height, name, "stone", "survival");
    }

    static byte[] createBlankMapBytes(Path output, int width, int height, String name, String floorName, String template) throws Exception {
        if (!isSafeMapSize(width, height) || name == null || name.isBlank() || name.length() > 120) throw new IOException("invalid map dimensions or name");
        Block floorBlock = Vars.content.getByName(ContentType.block, floorName);
        if (!(floorBlock instanceof Floor floor) || isA(floorBlock, "LegacyBlock")
            || !java.util.Set.of("survival", "sandbox", "attack", "pvp", "custom").contains(template)) throw new IOException("invalid map template or floor");
        var tiles = Vars.world.resize(width, height);
        for (int x = 0; x < width; x++) for (int y = 0; y < height; y++) {
            tiles.set(x, y, new mindustry.world.Tile(x, y, floor.id, 0, 0));
        }
        mindustry.game.Rules rules = new mindustry.game.Rules();
        switch (template) {
            case "sandbox" -> { rules.infiniteResources = true; rules.waves = false; rules.waveTimer = false; }
            case "attack" -> { rules.attackMode = true; rules.waves = true; }
            case "pvp" -> { rules.pvp = true; rules.waves = false; rules.waveTimer = false; }
            case "survival", "custom" -> { }
            default -> throw new IOException("invalid map template");
        }
        Vars.state.rules = rules;
        StringMap tags = new StringMap();
        tags.put("name", name);
        tags.put("build", Integer.toString(Version.build));
        tags.put("rules", mindustry.io.JsonIO.write(Vars.state.rules));
        Map map = new Map(new Fi(output.toFile()), width, height, tags, true);
        Vars.state.map = map;
        MapIO.writeMap(new Fi(output.toFile()), map, false);
        Map roundTrip = MapIO.createMap(new Fi(output.toFile()), true);
        if (roundTrip.width != width || roundTrip.height != height || !name.equals(roundTrip.tags.get("name", ""))) {
            throw new IOException("map dimensions or metadata did not round-trip");
        }
        MapIO.loadMap(roundTrip);
        if (Vars.world == null || Vars.world.tiles == null || Vars.world.tiles.width != width || Vars.world.tiles.height != height) {
            throw new IOException("map world did not round-trip");
        }
        return Files.readAllBytes(output);
    }

    private static String teamCatalogEntries() {
        StringBuilder result = new StringBuilder("[");
        java.util.ArrayList<mindustry.game.Team> teams = new java.util.ArrayList<>();
        for (mindustry.game.Team team : mindustry.game.Team.all) if (team != null) teams.add(team);
        teams.sort(java.util.Comparator.comparingInt(team -> team.id));
        boolean first = true;
        for (mindustry.game.Team team : teams) {
            if (!first) result.append(',');
            first = false;
            String key = "team." + team.name + ".name";
            String name = chineseBundle == null ? null : chineseBundle.getProperty(key);
            int rgba = (Math.round(team.color.r * 255f) << 24) | (Math.round(team.color.g * 255f) << 16)
                | (Math.round(team.color.b * 255f) << 8) | Math.round(team.color.a * 255f);
            result.append("{\"internal_name\":").append(quote(team.name))
                .append(",\"display_name\":").append(quote(name == null || name.isBlank() ? team.name : name))
                .append(",\"id\":").append(team.id)
                .append(",\"color\":").append(quote(String.format(java.util.Locale.ROOT, "#%08x", Integer.toUnsignedLong(rgba))))
                .append('}');
        }
        return result.append(']').toString();
    }

    private static BufferedImage contentIcon(ContentType type, String id) {
        if (spriteAtlas == null) return null;
        return switch (type) {
            case block -> spriteAtlas.findBlock(id);
            case item -> spriteAtlas.findItem(id);
            case liquid -> spriteAtlas.findLiquid(id);
            case unit -> spriteAtlas.findUnit(id);
            case status -> spriteAtlas.findStatus(id);
            default -> null;
        };
    }

    private static String localizedCategory(String category) {
        return switch (category) {
            case "distribution" -> "物流";
            case "liquid" -> "液体";
            case "production" -> "生产";
            case "power" -> "电力";
            case "effect" -> "效果";
            case "defense" -> "防御";
            case "crafting" -> "加工";
            case "units" -> "单位";
            case "logic" -> "逻辑";
            case "turrets" -> "炮塔";
            default -> "其他";
        };
    }

    private static void editorCatalog(HttpExchange exchange) throws IOException {
        if (!"GET".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        JsonArrayBuilder entries = new JsonArrayBuilder(5_000);
        for (ContentType type : List.of(ContentType.block, ContentType.unit, ContentType.item, ContentType.liquid, ContentType.status, ContentType.planet)) {
            for (var raw : Vars.content.getBy(type)) {
                if (!(raw instanceof mindustry.ctype.UnlockableContent content) || content.name == null || isA(content, "LegacyBlock")) continue;
                String category = type.name(); int size = 1;
                if (content instanceof Block block) {
                    size = block.size;
                    category = block.isFloor() ? (block instanceof mindustry.world.blocks.environment.OverlayFloor ? "overlay" : "floor")
                        : block instanceof mindustry.world.blocks.storage.CoreBlock ? "core" : block.category.name();
                } else if (content instanceof mindustry.type.UnitType unit) category = unit.flying ? "air" : unit.naval ? "naval" : "ground";
                String localized = chineseBundle == null ? null : chineseBundle.getProperty(type.name() + "." + content.name + ".name");
                BufferedImage icon = spriteAtlas == null ? null : content instanceof Block block ? spriteAtlas.findBlock(block) : spriteAtlas.find(content.name);
                String iconData = "null";
                if (icon != null) {
                    BufferedImage small = new BufferedImage(32, 32, BufferedImage.TYPE_INT_ARGB);
                    var graphics = small.createGraphics(); graphics.drawImage(icon, 0, 0, 32, 32, null); graphics.dispose();
                    ByteArrayOutputStream png = new ByteArrayOutputStream(); ImageIO.write(small, "png", png);
                    iconData = quote("data:image/png;base64," + Base64.getEncoder().encodeToString(png.toByteArray()));
                }
                JsonArrayBuilder planets = new JsonArrayBuilder(32);
                for (mindustry.type.Planet planet : content.shownPlanets) planets.add(quote(planet.name));
                entries.add("{\"type\":" + quote(type.name()) + ",\"name\":" + quote(content.name)
                    + ",\"label\":" + quote(localized == null ? content.name : localized)
                    + ",\"english\":" + quote(content.localizedName == null ? content.name : content.localizedName)
                    + (content instanceof Block block ? ",\"config_types\":" + schematicConfigTypesJson(block) : "")
                    + ",\"planets\":" + planets
                    + ",\"category\":" + quote(category) + ",\"size\":" + size + ",\"icon\":" + iconData + "}");
            }
        }
        send(exchange, 200, "{\"items\":" + entries + "}");
    }

    private static void mapRegion(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        Path input = null;
        try {
            JsonValue request = JSON.parse(new String(readLimited(exchange, MAX_BYTES * 2), StandardCharsets.UTF_8));
            byte[] source = Base64.getDecoder().decode(request.getString("dataBase64", ""));
            String hash = request.getString("sha256", "");
            int x = request.getInt("x", -1), y = request.getInt("y", -1);
            if (source.length == 0 || source.length > MAX_BYTES || !HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source)).equals(hash) || x < 0 || y < 0) throw new IllegalArgumentException();
            Path inputs = storageRoot.resolve("worker-input"); Files.createDirectories(inputs);
            input = Files.createTempFile(inputs, "map-region-", ".msav"); Files.write(input, source);
            validateInflated(input, MAX_INFLATED_MAP_BYTES, 0);
            Map map = MapIO.createMap(new Fi(input.toFile()), true);
            SaveMeta meta = SaveIO.getMeta(new Fi(input.toFile()));
            if (!isSafeMapSize(map.width, map.height) || hasMods(meta) || map.mod != null || x >= map.width || y >= map.height) throw new IllegalArgumentException();
            MapIO.loadMap(map);
            JsonArrayBuilder terrain = new JsonArrayBuilder(16384);
            for (int tx = x; tx < Math.min(x + 128, map.width); tx++) for (int ty = y; ty < Math.min(y + 128, map.height); ty++) {
                var tile = Vars.world.tile(tx, ty);
                terrain.add("{\"x\":" + tx + ",\"y\":" + ty + ",\"floor\":" + quote(tile.floor().name) + ",\"overlay\":" + quote(tile.overlay().name) + "}");
            }
            send(exchange, 200, "{\"terrain\":" + terrain + "}");
        } catch (Exception exception) { send(exchange, 422, error("INVALID_MAP_REGION")); }
        finally { if (input != null) Files.deleteIfExists(input); }
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
            JsonValue rawMoves = request.get("move_positions");
            JsonValue rawRotations = request.get("rotate_positions");
            JsonValue rawAdds = request.get("add_blocks");
            JsonValue rawLogicConfigs = request.get("logic_configs");
            JsonValue rawConfigEdits = request.get("config_edits");
            if (filename.length() > 255 || !filename.toLowerCase().endsWith(".msch")
                || !sourceHash.matches("[a-f0-9]{64}") || encoded.isEmpty()
                || rotation < 0 || rotation > 3 || (rawDeletes != null && !rawDeletes.isArray())
                || (rawMoves != null && !rawMoves.isArray()) || (rawAdds != null && !rawAdds.isArray())
                || (rawRotations != null && !rawRotations.isArray())
                || (rawLogicConfigs != null && !rawLogicConfigs.isArray())
                || (rawConfigEdits != null && !rawConfigEdits.isArray())) {
                send(exchange, 422, error("INVALID_SCHEMATIC_OPERATION")); return;
            }
            byte[] source = Base64.getDecoder().decode(encoded);
            String actualHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source));
            if (source.length == 0 || source.length > MAX_BYTES || !actualHash.equals(sourceHash)) {
                send(exchange, 422, error("INVALID_FILE")); return;
            }
            List<Point2> deletePositions = readDeletePositions(rawDeletes);
            List<MovePosition> movePositions = readMovePositions(rawMoves);
            List<RotatePosition> rotatePositions = readRotatePositions(rawRotations);
            List<AddedBlock> addedBlocks = readAddedBlocks(rawAdds);
            List<LogicConfigEdit> logicConfigs = readLogicConfigEdits(rawLogicConfigs);
            List<SchematicConfigEdit> configEdits = readSchematicConfigEdits(rawConfigEdits);
            Path inputs = storageRoot.resolve("worker-input").normalize();
            Files.createDirectories(inputs);
            input = Files.createTempFile(inputs, "schematic-edit-", ".msch");
            Files.write(input, source);
            byte[] output = transformSchematicBytes(input, rotation, mirrorX, deletePositions, movePositions, rotatePositions, addedBlocks, logicConfigs, configEdits);
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

    /** Edits a derived .msav copy with official MapIO and validates it by loading the result again. */
    private static void transformMap(HttpExchange exchange) throws IOException {
        if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) { send(exchange, 405, error("INVALID_REQUEST")); return; }
        if (!authorized(exchange)) { send(exchange, 401, error("UNAUTHORIZED")); return; }
        Path input = null;
        Path output = null;
        try {
            JsonValue request = JSON.parse(new String(readLimited(exchange, MAX_BYTES * 2), StandardCharsets.UTF_8));
            String filename = request.getString("filename", "");
            String sourceHash = request.getString("sha256", "").toLowerCase();
            String encoded = request.getString("dataBase64", "");
            JsonValue rawTerrain = request.get("terrain_changes");
            JsonValue rawRules = request.get("rule_changes");
            JsonValue rawWaves = request.get("wave_operations");
            JsonValue rawObjects = request.get("object_operations");
            if (filename.length() > 255 || !filename.toLowerCase().endsWith(".msav")
                || !sourceHash.matches("[a-f0-9]{64}") || encoded.isEmpty()
                || (rawTerrain != null && !rawTerrain.isArray())
                || (rawRules != null && !rawRules.isObject())
                || (rawWaves != null && !rawWaves.isArray())
                || (rawObjects != null && !rawObjects.isArray())) {
                send(exchange, 422, error("INVALID_MAP_OPERATION")); return;
            }
            byte[] source = Base64.getDecoder().decode(encoded);
            String actualHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(source));
            if (source.length < 8 || source.length > MAX_BYTES || !actualHash.equals(sourceHash)) {
                send(exchange, 422, error("INVALID_FILE")); return;
            }
            List<MapTerrainChange> terrain = readMapTerrainChanges(rawTerrain);
            List<MapWaveOperation> waves = readMapWaveOperations(rawWaves);
            List<MapObjectOperation> objects = readMapObjectOperations(rawObjects);
            Path inputs = storageRoot.resolve("worker-input").normalize();
            Files.createDirectories(inputs);
            input = Files.createTempFile(inputs, "map-edit-", ".msav");
            output = Files.createTempFile(inputs, "map-edited-", ".msav");
            Files.write(input, source);
            byte[] edited = transformMapBytes(input, output, terrain, rawRules, waves, objects);
            String outputHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(edited));
            send(exchange, 200, "{\"dataBase64\":" + quote(Base64.getEncoder().encodeToString(edited))
                + ",\"sha256\":" + quote(outputHash) + "}");
        } catch (MapTransformException exception) {
            send(exchange, 422, error(exception.errorCode));
        } catch (IllegalArgumentException exception) {
            send(exchange, 422, error("INVALID_MAP_OPERATION"));
        } catch (Exception exception) {
            exception.printStackTrace(System.err);
            send(exchange, 422, error("INVALID_MAP"));
        } finally {
            if (input != null) Files.deleteIfExists(input);
            if (output != null) Files.deleteIfExists(output);
        }
    }

    private static List<MapTerrainChange> readMapTerrainChanges(JsonValue raw) throws MapTransformException {
        java.util.ArrayList<MapTerrainChange> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<Long> unique = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= MAX_MAP_LAYER_ITEMS || !item.isObject()) throw new MapTransformException("INVALID_MAP_OPERATION");
            int x = item.getInt("x", Integer.MIN_VALUE);
            int y = item.getInt("y", Integer.MIN_VALUE);
            String floor = item.getString("floor", "");
            String overlay = item.getString("overlay", "");
            if (x < 0 || y < 0 || x >= 32_768 || y >= 32_768
                || !floor.matches("[a-zA-Z0-9_.:-]{1,191}")
                || (!overlay.isEmpty() && !overlay.matches("[a-zA-Z0-9_.:-]{1,191}"))
                || !unique.add(positionKey(x, y))) throw new MapTransformException("INVALID_MAP_OPERATION");
            result.add(new MapTerrainChange(x, y, floor, overlay));
        }
        return result;
    }

    private static List<MapWaveOperation> readMapWaveOperations(JsonValue raw) throws MapTransformException {
        java.util.ArrayList<MapWaveOperation> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 1_000 || !item.isObject()) throw new MapTransformException("INVALID_WAVE_OPERATION");
            String action = item.getString("action", "");
            int index = item.getInt("index", Integer.MIN_VALUE);
            int toIndex = item.getInt("to_index", Integer.MIN_VALUE);
            JsonValue fields = item.get("fields");
            if (!(action.equals("add") || action.equals("update") || action.equals("delete") || action.equals("move"))
                || (action.equals("add") ? index < 0 || index > 5_000 || fields == null || !fields.isObject()
                    : index < 0 || index > 5_000)
                || (action.equals("update") && (fields == null || !fields.isObject()))
                || (action.equals("move") && (toIndex < 0 || toIndex > 5_000))) {
                throw new MapTransformException("INVALID_WAVE_OPERATION");
            }
            result.add(new MapWaveOperation(action, index, toIndex, fields));
        }
        return result;
    }

    static List<MapObjectOperation> readMapObjectOperations(JsonValue raw) throws MapTransformException {
        java.util.ArrayList<MapObjectOperation> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<String> unique = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 2_000 || !item.isObject()) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            String action = item.getString("action", "");
            String type = item.getString("object_type", "");
            if (!(type.equals("core") || type.equals("spawn") || type.equals("building"))) {
                throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            }
            MapObjectOperation operation;
            switch (action) {
                case "add" -> {
                    boolean teamRequired = !type.equals("spawn");
                    if (!hasOnlyKeys(item, teamRequired
                        ? new String[]{"action", "object_type", "x", "y", "name", "team", "rotation"}
                        : new String[]{"action", "object_type", "x", "y", "name", "rotation"})) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    int x = item.getInt("x", Integer.MIN_VALUE), y = item.getInt("y", Integer.MIN_VALUE);
                    String name = item.getString("name", "");
                    String team = teamRequired ? item.getString("team", "") : "";
                    int rotation = item.getInt("rotation", 0);
                    if (x < 0 || y < 0 || x >= 32_768 || y >= 32_768
                        || !name.matches("[a-zA-Z0-9_.:-]{1,191}")
                        || (teamRequired && !team.matches("[a-zA-Z0-9_#-]{1,40}"))
                        || rotation < 0 || rotation > 3 || (type.equals("spawn") && rotation != 0)) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    operation = new MapObjectOperation(action, type, x, y, -1, -1, -1, -1, name, team, rotation);
                }
                case "delete" -> {
                    if (!hasOnlyKeys(item, new String[]{"action", "object_type", "x", "y"})) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    int x = item.getInt("x", Integer.MIN_VALUE), y = item.getInt("y", Integer.MIN_VALUE);
                    if (x < 0 || y < 0 || x >= 32_768 || y >= 32_768
                        || !unique.add(type + ":" + positionKey(x, y) + ":position")) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    operation = new MapObjectOperation(action, type, x, y, -1, -1, -1, -1, "", "", 0);
                }
                case "move" -> {
                    if (!hasOnlyKeys(item, new String[]{"action", "object_type", "from_x", "from_y", "to_x", "to_y"})) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    int fromX = item.getInt("from_x", Integer.MIN_VALUE), fromY = item.getInt("from_y", Integer.MIN_VALUE);
                    int toX = item.getInt("to_x", Integer.MIN_VALUE), toY = item.getInt("to_y", Integer.MIN_VALUE);
                    if (fromX < 0 || fromY < 0 || toX < 0 || toY < 0 || fromX >= 32_768 || fromY >= 32_768 || toX >= 32_768 || toY >= 32_768
                        || !unique.add(type + ":" + positionKey(fromX, fromY) + ":position")) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    operation = new MapObjectOperation(action, type, -1, -1, fromX, fromY, toX, toY, "", "", 0);
                }
                case "rotate" -> {
                    if (type.equals("spawn") || !hasOnlyKeys(item, new String[]{"action", "object_type", "x", "y", "rotation"})) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    int x = item.getInt("x", -1), y = item.getInt("y", -1), rotation = item.getInt("rotation", -1);
                    if (x < 0 || y < 0 || x >= 32768 || y >= 32768 || rotation < 0 || rotation > 3 || !unique.add(type + ":" + positionKey(x, y) + ":rotation")) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    operation = new MapObjectOperation(action, type, x, y, -1, -1, -1, -1, "", "", rotation);
                }
                case "team" -> {
                    if (type.equals("spawn") || !hasOnlyKeys(item, new String[]{"action", "object_type", "x", "y", "team"})) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    int x = item.getInt("x", Integer.MIN_VALUE), y = item.getInt("y", Integer.MIN_VALUE);
                    String team = item.getString("team", "");
                    if (x < 0 || y < 0 || x >= 32_768 || y >= 32_768
                        || !team.matches("[a-zA-Z0-9_#-]{1,40}")
                        || !unique.add(type + ":" + positionKey(x, y) + ":team")) {
                        throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                    }
                    operation = new MapObjectOperation(action, type, x, y, -1, -1, -1, -1, "", team, 0);
                }
                default -> throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            }
            result.add(operation);
        }
        return result;
    }

    private static boolean hasOnlyKeys(JsonValue object, String[] allowedKeys) {
        java.util.HashSet<String> allowed = new java.util.HashSet<>(java.util.Arrays.asList(allowedKeys));
        for (JsonValue child = object.child; child != null; child = child.next) {
            if (!allowed.contains(child.name)) return false;
        }
        return true;
    }

    static byte[] transformMapBytes(Path input, Path output, List<MapTerrainChange> terrainChanges,
        JsonValue ruleChanges, List<MapWaveOperation> waveOperations) throws Exception {
        return transformMapBytes(input, output, terrainChanges, ruleChanges, waveOperations, List.of());
    }

    static byte[] transformMapBytes(Path input, Path output, List<MapTerrainChange> terrainChanges,
        JsonValue ruleChanges, List<MapWaveOperation> waveOperations, List<MapObjectOperation> objectOperations) throws Exception {
        validateInflated(input, MAX_INFLATED_MAP_BYTES, 0);
        Map map = MapIO.createMap(new Fi(input.toFile()), true);
        SaveMeta meta = SaveIO.getMeta(new Fi(input.toFile()));
        if (!isSafeMapSize(map.width, map.height)) {
            throw new MapTransformException("UNSUPPORTED_MAP_SIZE");
        }
        if (hasMods(meta) || (map.mod != null) || !map.tags.get("mod", "").isBlank()) {
            throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
        }
        MapIO.loadMap(map);
        if (Vars.world == null || Vars.world.tiles == null || Vars.world.tiles.width != map.width || Vars.world.tiles.height != map.height) {
            throw new MapTransformException("INVALID_MAP");
        }
        for (mindustry.world.Tile tile : Vars.world.tiles) {
            if (isA(tile.block(), "LegacyBlock") || isA(tile.floor(), "LegacyBlock") || isA(tile.overlay(), "LegacyBlock")) {
                throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
            }
        }
        if (!objectOperations.isEmpty()) applyMapObjectOperations(objectOperations, map.width, map.height);
        java.util.Map<Long, mindustry.world.Tile> tilesByPosition = new java.util.HashMap<>();
        for (mindustry.world.Tile tile : Vars.world.tiles) tilesByPosition.put(positionKey(tile.x, tile.y), tile);
        Block airBlock = Vars.content.getByName(ContentType.block, "air");
        if (airBlock == null || !airBlock.isFloor()) throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
        for (MapTerrainChange change : terrainChanges) {
            mindustry.world.Tile tile = tilesByPosition.get(positionKey(change.x(), change.y()));
            Block floor = Vars.content.getByName(ContentType.block, change.floor());
            boolean clearOverlay = change.overlay().isEmpty() || change.overlay().equals("air");
            Block overlay = clearOverlay ? airBlock : Vars.content.getByName(ContentType.block, change.overlay());
            if (tile == null || floor == null || !floor.isFloor()
                || (!clearOverlay && overlay != null && (!overlay.isFloor() || !overlay.asFloor().isOverlay()))) {
                throw new MapTransformException(floor == null || (!change.overlay().isEmpty() && overlay == null)
                    ? "UNSUPPORTED_MAP_CONTENT" : "INVALID_MAP_OPERATION");
            }
        }
        String rawRules = map.tags.get("rules", "{}");
        JsonValue editedRules;
        try {
            editedRules = JSON.parse(rawRules);
            if (editedRules == null || !editedRules.isObject()) throw new IllegalArgumentException("rules root is not an object");
        } catch (Exception exception) {
            throw new MapTransformException("UNSUPPORTED_MAP_RULES");
        }
        if (ruleChanges != null) applyRuleChanges(editedRules, ruleChanges);
        JsonValue waves = editedRules.get("spawns");
        if (!waveOperations.isEmpty()) {
            waves = applyWaveOperations(waves, waveOperations);
            setJsonChild(editedRules, "spawns", waves);
        }
        rawRules = editedRules.toJson(JsonWriter.OutputType.minimal);
        try {
            Vars.state.rules = mindustry.io.JsonIO.read(mindustry.game.Rules.class, rawRules);
            if (Vars.state.rules == null) throw new IllegalArgumentException("rules could not be read");
        } catch (Exception exception) {
            throw new MapTransformException("INVALID_MAP_RULES");
        }
        map.tags.put("rules", rawRules);

        for (MapTerrainChange change : terrainChanges) {
            mindustry.world.Tile tile = tilesByPosition.get(positionKey(change.x(), change.y()));
            Block floor = Vars.content.getByName(ContentType.block, change.floor());
            Block overlay = change.overlay().isEmpty() || change.overlay().equals("air")
                ? airBlock : Vars.content.getByName(ContentType.block, change.overlay());
            tile.setFloor(floor.asFloor());
            tile.setOverlay(overlay.asFloor());
        }
        Vars.state.map = map;
        MapStructure beforeWrite = mapStructure();
        MapIO.writeMap(new Fi(output.toFile()), map, false);
        byte[] officialOutput = Files.readAllBytes(output);
        if (officialOutput.length < 8 || officialOutput.length > MAX_BYTES) throw new MapTransformException("INVALID_MAP");
        byte[] withPreservedRules = patchMapRules(officialOutput, rawRules);
        Files.write(output, withPreservedRules);

        Map roundTrip = MapIO.createMap(new Fi(output.toFile()), true);
        if (!rawRules.equals(roundTrip.tags.get("rules", "{}"))) throw new MapTransformException("INVALID_MAP_RULES");
        MapIO.loadMap(roundTrip);
        MapStructure afterRoundTrip = mapStructure();
        if (!beforeWrite.equals(afterRoundTrip)) throw new MapTransformException("INVALID_MAP");
        for (MapTerrainChange change : terrainChanges) {
            mindustry.world.Tile tile = Vars.world.tiles.getn(change.x(), change.y());
            Block floor = Vars.content.getByName(ContentType.block, change.floor());
            Block overlay = change.overlay().isEmpty() || change.overlay().equals("air")
                ? airBlock : Vars.content.getByName(ContentType.block, change.overlay());
            if (tile.floor() != floor || tile.overlay() != overlay) throw new MapTransformException("INVALID_MAP");
        }
        return withPreservedRules;
    }

    private static boolean hasMods(SaveMeta metadata) {
        if (metadata == null || metadata.mods == null) return false;
        for (String mod : metadata.mods) if (mod != null && !mod.isBlank()) return true;
        return false;
    }

    static boolean isSafeMapSize(int width, int height) {
        long area = (long)width * height;
        return width > 0 && height > 0 && area > 0 && area <= MAX_MAP_TILE_AREA;
    }

    private static void applyRuleChanges(JsonValue rules, JsonValue changes) throws MapTransformException {
        java.util.Set<String> booleans = java.util.Set.of(
            "allowEditRules", "infiniteResources", "coreBuildAndConfig", "waveTimer", "waveSending", "waves", "airUseSpawns", "wavesSpawnAtCores",
            "pvp", "pvpAutoPause", "pauseDisabled", "waitEnemies", "attackMode", "editor", "derelictRepair", "canGameOver", "coreCapture",
            "reactorExplosions", "possessionAllowed", "schematicsAllowed", "damageExplosions", "fire", "randomWaveAI", "unitPayloadUpdate",
            "unitPayloadsExplode", "unitCapVariable", "hideSpawns", "ghostBlocks", "showOtherTeamPings", "logicUnitControl", "logicUnitBuild",
            "logicUnitDeconstruct", "worldProcessorPlayerLink", "allowEditWorldProcessors", "disableWorldProcessors", "polygonCoreProtection",
            "placeRangeCheck", "cleanupDeadTeams", "onlyDepositCore", "allowCoreUnloaders", "coreDestroyClear", "hideBannedBlocks",
            "allowEnvironmentDeconstruct", "instantBuild", "blockWhitelist", "unitWhitelist", "disableUnitCap", "lighting"
        );
        java.util.Set<String> integers = java.util.Set.of("unitCap", "winWave", "environment");
        java.util.Set<String> numbers = java.util.Set.of(
            "solarMultiplier", "unitBuildSpeedMultiplier", "unitCostMultiplier", "unitDamageMultiplier", "unitHealthMultiplier",
            "unitCrashDamageMultiplier", "unitMineSpeedMultiplier", "unitFactoryActivationDelay", "blockHealthMultiplier", "blockDamageMultiplier",
            "buildCostMultiplier", "buildSpeedMultiplier", "deconstructRefundMultiplier", "enemyCoreBuildRadius", "dropZoneRadius", "waveSpacing",
            "initialWaveSpacing", "itemDepositCooldown"
        );
        java.util.Set<String> arrays = java.util.Set.of("bannedBlocks", "bannedUnits");
        for (JsonValue change = changes.child; change != null; change = change.next) {
            String key = change.name;
            JsonValue value = change;
            if (key == null) throw new MapTransformException("INVALID_MAP_RULES");
            if (booleans.contains(key)) {
                if (!value.isBoolean()) throw new MapTransformException("INVALID_MAP_RULES");
            } else if (integers.contains(key)) {
                if (!value.isNumber() || value.asDouble() != Math.rint(value.asDouble()) || value.asLong() < (key.equals("environment") ? 0 : 0)
                    || value.asLong() > (key.equals("environment") ? Integer.MAX_VALUE : 1_000_000)) throw new MapTransformException("INVALID_MAP_RULES");
            } else if (numbers.contains(key)) {
                if (!value.isNumber() || !Double.isFinite(value.asDouble()) || Math.abs(value.asDouble()) > 1_000_000_000d) throw new MapTransformException("INVALID_MAP_RULES");
            } else if (key.equals("modeName")) {
                if (!value.isString() || value.asString().length() > 100) throw new MapTransformException("INVALID_MAP_RULES");
            } else if (arrays.contains(key)) {
                if (!value.isArray() || value.size > 500) throw new MapTransformException("INVALID_MAP_RULES");
                ContentType type = key.equals("bannedBlocks") ? ContentType.block : ContentType.unit;
                for (JsonValue entry = value.child; entry != null; entry = entry.next) {
                    if (!entry.isString() || entry.asString().length() > 191 || Vars.content.getByName(type, entry.asString()) == null) {
                        throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
                    }
                }
            } else {
                throw new MapTransformException("INVALID_MAP_RULES");
            }
            setJsonChild(rules, key, cloneJson(value));
        }
    }

    private static JsonValue applyWaveOperations(JsonValue source, List<MapWaveOperation> operations) throws MapTransformException {
        java.util.ArrayList<JsonValue> groups = new java.util.ArrayList<>();
        if (source != null) {
            if (!source.isArray() || source.size > 5_000) throw new MapTransformException("UNSUPPORTED_MAP_RULES");
            for (JsonValue group = source.child; group != null; group = group.next) {
                if (!group.isObject()) throw new MapTransformException("UNSUPPORTED_MAP_RULES");
                groups.add(cloneJson(group));
            }
        }
        for (MapWaveOperation operation : operations) {
            if (operation.action().equals("add")) {
                if (groups.size() >= 5_000 || operation.index() > groups.size()) throw new MapTransformException("INVALID_WAVE_OPERATION");
                validateWaveGroupFields(operation.fields(), true);
                JsonValue group = new JsonValue(JsonValue.ValueType.object);
                for (JsonValue field = operation.fields().child; field != null; field = field.next) setJsonChild(group, field.name, cloneJson(field));
                groups.add(operation.index(), group);
            } else {
                if (operation.index() >= groups.size()) throw new MapTransformException("INVALID_WAVE_OPERATION");
                if (operation.action().equals("delete")) {
                    groups.remove(operation.index());
                } else if (operation.action().equals("move")) {
                    if (operation.toIndex() >= groups.size()) throw new MapTransformException("INVALID_WAVE_OPERATION");
                    JsonValue group = groups.remove(operation.index());
                    groups.add(operation.toIndex(), group);
                } else {
                    validateWaveGroupFields(operation.fields(), false);
                    JsonValue group = groups.get(operation.index());
                    for (JsonValue field = operation.fields().child; field != null; field = field.next) setJsonChild(group, field.name, cloneJson(field));
                }
            }
        }
        JsonValue result = new JsonValue(JsonValue.ValueType.array);
        for (JsonValue group : groups) result.addChild(cloneJson(group));
        return result;
    }

    private static void validateWaveGroupFields(JsonValue fields, boolean isNew) throws MapTransformException {
        java.util.Set<String> allowed = java.util.Set.of("type", "begin", "end", "spacing", "max", "scaling", "shields", "shieldScaling", "amount", "spawn", "effect", "payloads", "items", "team");
        if (isNew && !fields.has("type")) throw new MapTransformException("INVALID_WAVE_OPERATION");
        for (JsonValue field = fields.child; field != null; field = field.next) {
            String key = field.name;
            if (key == null || !allowed.contains(key)) throw new MapTransformException("INVALID_WAVE_OPERATION");
            if (key.equals("type")) {
                if (!field.isString() || Vars.content.getByName(ContentType.unit, field.asString()) == null) throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
            } else if (key.equals("effect")) {
                if (!field.isString() || Vars.content.getByName(ContentType.status, field.asString()) == null) throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
            } else if (key.equals("payloads")) {
                if (!field.isArray() || field.size > 100) throw new MapTransformException("INVALID_WAVE_OPERATION");
                for (JsonValue payload = field.child; payload != null; payload = payload.next) {
                    if (!payload.isString() || Vars.content.getByName(ContentType.unit, payload.asString()) == null) throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
                }
            } else if (key.equals("items")) {
                JsonValue item = field.get("item");
                JsonValue amount = field.get("amount");
                if (!field.isObject() || field.size > 2 || item == null || !item.isString()
                    || Vars.content.getByName(ContentType.item, item.asString()) == null || amount == null
                    || !amount.isNumber() || amount.asInt() < 0 || amount.asInt() > 1_000_000 || amount.asDouble() != amount.asInt()) {
                    throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
                }
            } else if (key.equals("team")) {
                if (!field.isNumber() || field.asInt() < 0 || field.asInt() > 255 || field.asDouble() != field.asInt()) throw new MapTransformException("INVALID_WAVE_OPERATION");
            } else if (key.equals("spawn")) {
                if (!field.isNumber() || field.asInt() < -1 || field.asInt() > 1_000_000 || field.asDouble() != field.asInt()) throw new MapTransformException("INVALID_WAVE_OPERATION");
            } else if (key.equals("begin") || key.equals("end") || key.equals("spacing") || key.equals("max") || key.equals("amount")) {
                if (!field.isNumber() || field.asInt() < (key.equals("spacing") ? 1 : 0) || field.asInt() > 2_147_483_647 || field.asDouble() != field.asInt()) {
                    throw new MapTransformException("INVALID_WAVE_OPERATION");
                }
            } else if (!field.isNumber() || !Double.isFinite(field.asDouble()) || field.asDouble() < 0 || field.asDouble() > 1_000_000_000d) {
                throw new MapTransformException("INVALID_WAVE_OPERATION");
            }
        }
    }

    private static void setJsonChild(JsonValue object, String key, JsonValue value) {
        object.remove(key);
        object.addChild(key, value);
        object.size++;
    }

    private static JsonValue cloneJson(JsonValue value) {
        JsonValue copy;
        if (value.isObject()) copy = new JsonValue(JsonValue.ValueType.object);
        else if (value.isArray()) copy = new JsonValue(JsonValue.ValueType.array);
        else if (value.isString()) copy = new JsonValue(value.asString());
        else if (value.isLong()) copy = new JsonValue(value.asLong());
        else if (value.isDouble()) copy = new JsonValue(value.asDouble());
        else if (value.isBoolean()) copy = new JsonValue(value.asBoolean());
        else copy = new JsonValue((String)null);
        for (JsonValue child = value.child; child != null; child = child.next) {
            JsonValue cloned = cloneJson(child);
            if (value.isObject()) copy.addChild(child.name, cloned); else copy.addChild(cloned);
            copy.size++;
        }
        return copy;
    }

    static byte[] patchMapRules(byte[] save, String rawRules) throws IOException {
        byte[] uncompressed = inflateBounded(save, MAX_INFLATED_MAP_BYTES);
        try (DataInputStream data = new DataInputStream(new java.io.ByteArrayInputStream(uncompressed));
             ByteArrayOutputStream patched = new ByteArrayOutputStream(uncompressed.length);
             DataOutputStream output = new DataOutputStream(patched)) {
            SaveIO.readHeader(data);
            int version = data.readInt();
            int metaLength = data.readInt();
            if (metaLength < 0 || metaLength > uncompressed.length - 12) throw new IOException("invalid map metadata chunk");
            byte[] metaBytes = data.readNBytes(metaLength);
            if (metaBytes.length != metaLength) throw new IOException("truncated map metadata chunk");
            SaveVersion writer = SaveIO.getSaveWriter(version);
            if (writer == null) throw new IOException("unsupported output save version");
            StringMap tags = writer.readStringMap(new DataInputStream(new java.io.ByteArrayInputStream(metaBytes)));
            tags.put("rules", rawRules);
            ByteArrayOutputStream updatedMeta = new ByteArrayOutputStream();
            writer.writeStringMap(new DataOutputStream(updatedMeta), tags);
            output.write(SaveIO.header);
            output.writeInt(version);
            output.writeInt(updatedMeta.size());
            updatedMeta.writeTo(output);
            data.transferTo(output);
            output.flush();
            ByteArrayOutputStream compressed = new ByteArrayOutputStream();
            try (DeflaterOutputStream deflater = new DeflaterOutputStream(compressed)) {
                deflater.write(patched.toByteArray());
            }
            byte[] result = compressed.toByteArray();
            if (result.length > MAX_BYTES) throw new IOException("edited map exceeds size bound");
            validateInflatedBytes(result, MAX_INFLATED_MAP_BYTES);
            return result;
        }
    }

    private static byte[] inflateBounded(byte[] input, long limit) throws IOException {
        try (InflaterInputStream inflater = new InflaterInputStream(new ByteArrayInputStream(input));
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[16 * 1024];
            long total = 0;
            int read;
            while ((read = inflater.read(buffer)) != -1) {
                total += read;
                if (total > limit) throw new IOException("inflated input exceeds safe limit");
                bytes.write(buffer, 0, read);
            }
            return bytes.toByteArray();
        }
    }

    private static void validateInflatedBytes(byte[] input, long limit) throws IOException {
        try (InflaterInputStream inflater = new InflaterInputStream(new ByteArrayInputStream(input))) {
            byte[] buffer = new byte[16 * 1024];
            long total = 0;
            int read;
            while ((read = inflater.read(buffer)) != -1) {
                total += read;
                if (total > limit) throw new IOException("inflated input exceeds safe limit");
            }
        }
    }

    private static MapStructure mapStructure() throws IOException {
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IOException("SHA-256 unavailable", exception); }
        for (mindustry.world.Tile tile : Vars.world.tiles) {
            updateDigestInt(digest, tile.floorID());
            updateDigestInt(digest, tile.overlayID());
            updateDigestInt(digest, tile.blockID());
            updateDigestInt(digest, tile.data);
            updateDigestInt(digest, tile.floorData);
            updateDigestInt(digest, tile.overlayData);
            updateDigestInt(digest, tile.extraData);
            updateDigestInt(digest, tile.build == null || tile.build.team == null ? -1 : tile.build.team.id);
            if (tile.isCenter() && tile.build != null) {
                updateDigestInt(digest, 1);
                updateDigestInt(digest, tile.x);
                updateDigestInt(digest, tile.y);
                updateDigestInt(digest, tile.build.block.id);
                updateDigestInt(digest, tile.build.rotation);
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                try (DataOutputStream data = new DataOutputStream(bytes)) { tile.build.writeAll(new Writes(data)); }
                byte[] state = bytes.toByteArray();
                if (state.length > 1024 * 1024) throw new IOException("building state exceeds safe bound");
                updateDigestInt(digest, state.length);
                digest.update(state);
            } else {
                updateDigestInt(digest, 0);
            }
        }
        return new MapStructure(Vars.world.width(), Vars.world.height(), HexFormat.of().formatHex(digest.digest()));
    }

    private static void updateDigestInt(MessageDigest digest, int value) {
        digest.update((byte)(value >>> 24));
        digest.update((byte)(value >>> 16));
        digest.update((byte)(value >>> 8));
        digest.update((byte)value);
    }

    record MapTerrainChange(int x, int y, String floor, String overlay) {}
    record MapWaveOperation(String action, int index, int toIndex, JsonValue fields) {}
    record MapObjectOperation(String action, String objectType, int x, int y, int fromX, int fromY, int toX, int toY,
        String name, String team, int rotation) {}
    private record MapObject(String type, Block block, mindustry.game.Team team, int rotation, int x, int y,
        mindustry.gen.Building building, byte[] state) {}
    private static final class MapObjectChange {
        private Integer x;
        private Integer y;
        private Integer rotation;
        private mindustry.game.Team team;
        private boolean deleted;
        private boolean positionChanged;
    }
    private record PlannedMapObject(MapObject source, int x, int y, mindustry.game.Team team, int rotation,
        boolean addition, boolean deleted) {}
    record MapStructure(int width, int height, String sha256) {}
    static final class MapTransformException extends Exception {
        final String errorCode;
        MapTransformException(String errorCode) { super(errorCode); this.errorCode = errorCode; }
    }

    private static void applyMapObjectOperations(List<MapObjectOperation> operations, int width, int height) throws MapTransformException {
        java.util.Map<Long, MapObject> sourceObjects = new java.util.HashMap<>();
        for (mindustry.world.Tile tile : Vars.world.tiles) {
            Block block = tile.block();
            if (block == null || block == Vars.content.getByName(ContentType.block, "air")) continue;
            if (isA(block, "LegacyBlock")) throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
            if (block instanceof mindustry.world.blocks.storage.CoreBlock) {
                if (tile.build != null && tile.isCenter()) addMapObject(sourceObjects, mapObject("core", tile, block));
            } else if (isA(block, "SpawnBlock")) {
                addMapObject(sourceObjects, new MapObject("spawn", block, mindustry.game.Team.derelict,
                    0, tile.x, tile.y, null, null));
            } else if (tile.build != null) {
                if (tile.isCenter()) addMapObject(sourceObjects, mapObject("building", tile, block));
            } else {
                throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
            }
        }

        java.util.Map<Long, MapObjectChange> edits = new java.util.HashMap<>();
        java.util.ArrayList<PlannedMapObject> additions = new java.util.ArrayList<>();
        for (MapObjectOperation operation : operations) {
            if (operation.action().equals("add")) {
                Block block = Vars.content.getByName(ContentType.block, operation.name());
                mindustry.game.Team team = operation.objectType().equals("spawn") ? mindustry.game.Team.derelict : resolveMapTeam(operation.team());
                boolean correctType = block != null && !isA(block, "LegacyBlock") && switch (operation.objectType()) {
                    case "core" -> block instanceof mindustry.world.blocks.storage.CoreBlock;
                    case "spawn" -> isA(block, "SpawnBlock");
                    case "building" -> !(block instanceof mindustry.world.blocks.storage.CoreBlock)
                        && !isA(block, "SpawnBlock") && !block.isFloor() && block.newBuilding() != null;
                    default -> false;
                };
                if (!correctType || team == null) throw new MapTransformException(block == null ? "UNSUPPORTED_MAP_CONTENT" : "INVALID_MAP_OBJECT_OPERATION");
                additions.add(new PlannedMapObject(new MapObject(operation.objectType(), block, team, operation.rotation(),
                    operation.x(), operation.y(), null, null), operation.x(), operation.y(), team, operation.rotation(), true, false));
                continue;
            }
            int sourceX = operation.action().equals("move") ? operation.fromX() : operation.x();
            int sourceY = operation.action().equals("move") ? operation.fromY() : operation.y();
            long sourceKey = positionKey(sourceX, sourceY);
            MapObject source = sourceObjects.get(sourceKey);
            if (source == null || !source.type().equals(operation.objectType())) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            MapObjectChange edit = edits.computeIfAbsent(sourceKey, ignored -> new MapObjectChange());
            if (edit.deleted) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            if (source.building() != null && !isSafeMapConfig(source.building().config(), source.block(), width, height)) {
                throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
            }
            if (operation.action().equals("delete")) {
                if (edit.positionChanged || edit.team != null || edit.rotation != null) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                edit.deleted = true;
            } else if (operation.action().equals("move")) {
                if (edit.positionChanged || (operation.toX() == source.x() && operation.toY() == source.y())) {
                    throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                }
                edit.x = operation.toX(); edit.y = operation.toY(); edit.positionChanged = true;
            } else if (operation.action().equals("rotate")) {
                if (edit.rotation != null) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                edit.rotation = operation.rotation();
            } else if (operation.action().equals("team")) {
                if (edit.team != null) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                mindustry.game.Team team = resolveMapTeam(operation.team());
                if (team == null) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                edit.team = team;
            } else if (operation.action().equals("rotate")) {
                if (edit.rotation != null || !source.block().rotate) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                Object config = source.building() == null ? null : source.building().config();
                if (config != null && hasMapCoordinateConfig(config)) throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
                edit.rotation = operation.rotation();
            }
        }

        java.util.HashSet<Long> changedFootprint = new java.util.HashSet<>();
        for (var entry : sourceObjects.entrySet()) {
            MapObjectChange edit = edits.get(entry.getKey());
            if (edit != null && (edit.deleted || edit.positionChanged)) {
                if (!reserveMapFootprint(changedFootprint, entry.getValue().block(), entry.getValue().x(), entry.getValue().y(), width, height)) {
                    throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                }
            }
        }
        if (!changedFootprint.isEmpty()) {
            for (var entry : sourceObjects.entrySet()) {
                MapObject source = entry.getValue();
                Object config = source.building() == null ? null : source.building().config();
                if (config == null) continue;
                if (!isSafeMapConfig(config, source.block(), width, height)) throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
                MapObjectChange edit = edits.get(entry.getKey());
                if (edit != null && (edit.deleted || edit.positionChanged) && hasMapCoordinateConfig(config)) {
                    // The editor does not rewrite map power/bridge/link targets.
                    throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
                }
                if (mapConfigReferencesFootprint(config, changedFootprint)) {
                    throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
                }
            }
        }

        java.util.HashSet<Long> occupied = new java.util.HashSet<>();
        java.util.HashSet<Long> sourceFootprint = new java.util.HashSet<>();
        for (MapObject source : sourceObjects.values()) {
            if (!reserveMapFootprint(sourceFootprint, source.block(), source.x(), source.y(), width, height)) {
                throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            }
        }
        java.util.ArrayList<PlannedMapObject> planned = new java.util.ArrayList<>(sourceObjects.size() + additions.size());
        for (java.util.Map.Entry<Long, MapObject> entry : sourceObjects.entrySet()) {
            MapObject source = entry.getValue();
            MapObjectChange edit = edits.get(entry.getKey());
            if (edit != null && edit.deleted) {
                planned.add(new PlannedMapObject(source, source.x(), source.y(), source.team(), source.rotation(), false, true));
                continue;
            }
            int x = edit == null || edit.x == null ? source.x() : edit.x;
            int y = edit == null || edit.y == null ? source.y() : edit.y;
            int rotation = edit == null || edit.rotation == null ? source.rotation() : edit.rotation;
            mindustry.game.Team team = edit == null || edit.team == null ? source.team() : edit.team;
            if (team == null || !reserveMapFootprint(occupied, source.block(), x, y, width, height)) {
                throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            }
            planned.add(new PlannedMapObject(source, x, y, team, rotation, false, false));
        }
        for (PlannedMapObject addition : additions) {
            if (!reserveMapFootprint(occupied, addition.source().block(), addition.x(), addition.y(), width, height)) {
                throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            }
            planned.add(addition);
        }

        Block air = Vars.content.getByName(ContentType.block, "air");
        if (air == null) throw new MapTransformException("UNSUPPORTED_MAP_CONTENT");
        for (PlannedMapObject change : planned) {
            if (change.deleted()) continue;
            java.util.HashSet<Long> footprint = new java.util.HashSet<>();
            if (!reserveMapFootprint(footprint, change.source().block(), change.x(), change.y(), width, height)) {
                throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
            }
            for (long cell : footprint) {
                int x = (int)(cell >> 32), y = (int)cell;
                mindustry.world.Tile tile = Vars.world.tile(x, y);
                if (tile == null || (tile.block() != air && !sourceFootprint.contains(cell))) {
                    throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                }
            }
        }

        for (PlannedMapObject change : planned) {
            if (change.addition()) continue;
            boolean moved = change.x() != change.source().x() || change.y() != change.source().y() || change.rotation() != change.source().rotation();
            if (change.deleted() || moved) {
                mindustry.world.Tile sourceTile = Vars.world.tile(change.source().x(), change.source().y());
                if (sourceTile == null) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                sourceTile.setBlock(air, mindustry.game.Team.derelict, 0);
            }
        }
        for (PlannedMapObject change : planned) {
            if (change.deleted()) continue;
            if (change.addition() || change.x() != change.source().x() || change.y() != change.source().y()
                || change.rotation() != change.source().rotation()) {
                mindustry.world.Tile destination = Vars.world.tile(change.x(), change.y());
                if (destination == null) throw new MapTransformException("INVALID_MAP_OBJECT_OPERATION");
                destination.setBlock(change.source().block(), change.team(), change.rotation());
                if (destination.build != null && change.source().state() != null) {
                    try (DataInputStream input = new DataInputStream(new ByteArrayInputStream(change.source().state()))) {
                        destination.build.readAll(new Reads(input), change.source().building().version());
                        if (destination.build.team != change.team()) destination.setTeam(change.team());
                        destination.build.rotation = change.rotation();
                    } catch (IOException exception) {
                        throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
                    }
                }
                if (destination.build != null) destination.build.rotation = change.rotation();
            } else if (change.team() != change.source().team()) {
                mindustry.world.Tile existing = Vars.world.tile(change.source().x(), change.source().y());
                if (existing != null && existing.build != null) { existing.build.rotation = change.rotation(); if (change.team() != change.source().team()) existing.setTeam(change.team()); }
            }

        }
    }

    private static void addMapObject(java.util.Map<Long, MapObject> objects, MapObject object) throws MapTransformException {
        long key = positionKey(object.x(), object.y());
        if (objects.containsKey(key) || objects.size() >= MAX_MAP_LAYER_ITEMS) {
            throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
        }
        objects.put(key, object);
    }

    private static MapObject mapObject(String type, mindustry.world.Tile tile, Block block) throws MapTransformException {
        mindustry.gen.Building building = tile.build;
        if (building == null) return new MapObject(type, block, tile.team(), 0, tile.x, tile.y, null, null);
        try {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(bytes)) {
                building.writeAll(new Writes(output));
            }
            return new MapObject(type, block, tile.team(), building.rotation, tile.x, tile.y, building, bytes.toByteArray());
        } catch (IOException | RuntimeException exception) {
            throw new MapTransformException("UNSUPPORTED_MAP_OBJECT");
        }
    }

    private static mindustry.game.Team resolveMapTeam(String name) {
        if (name == null || name.isBlank()) return null;
        for (mindustry.game.Team team : mindustry.game.Team.all) {
            if (team != null && name.equals(team.name)) return team;
        }
        return null;
    }

    private static boolean reserveMapFootprint(java.util.Set<Long> occupied, Block block, int anchorX, int anchorY,
        int width, int height) {
        if (block == null || block.size < 1 || block.size > 16) return false;
        int left = anchorX + block.sizeOffset, bottom = anchorY + block.sizeOffset;
        for (int dx = 0; dx < block.size; dx++) for (int dy = 0; dy < block.size; dy++) {
            int x = left + dx, y = bottom + dy;
            if (x < 0 || y < 0 || x >= width || y >= height || !occupied.add(positionKey(x, y))) return false;
        }
        return true;
    }

    private static boolean isSafeMapConfig(Object config, Block block, int width, int height) {
        if (config == null) return true;
        if (!hasRegisteredConfigAssignable(block, config.getClass())) return false;
        if (config instanceof Integer || config instanceof Long || config instanceof Boolean
            || config instanceof Float floatValue && Float.isFinite(floatValue)
            || config instanceof Double doubleValue && Double.isFinite(doubleValue)
            || config instanceof String stringValue && stringValue.length() <= 1_200
            || config instanceof mindustry.ctype.MappableContent content
                && Vars.content.getByName(content.getContentType(), content.name) == content
            || config instanceof arc.math.geom.Point2 point && point.x >= 0 && point.y >= 0 && point.x < width && point.y < height
            || config instanceof arc.math.geom.Point2[] points && points.length <= 255 && java.util.Arrays.stream(points).allMatch(point -> point != null
                && point.x >= 0 && point.y >= 0 && point.x < width && point.y < height)
            || config instanceof arc.struct.IntSeq intSequence && intSequence.size <= 1_000
            || config instanceof int[] integerArray && integerArray.length <= 1_000
            || config instanceof boolean[] booleanArray && booleanArray.length <= 1_000
            || config instanceof byte[] bytes && block instanceof LogicBlock && safeLogicConfig(bytes)
            || config instanceof mindustry.game.Team team && mindustry.game.Team.get(team.id) == team
            || config instanceof mindustry.logic.LAccess access && mindustry.logic.LAccess.valueOf(access.name()) == access
            || config instanceof mindustry.ai.UnitCommand command && Vars.content.getByName(ContentType.unitCommand, command.name) == command) return true;
        return false;
    }

    private static boolean hasMapCoordinateConfig(Object config) {
        if (config instanceof arc.math.geom.Point2 || config instanceof arc.math.geom.Point2[] points && points.length > 0) return true;
        if (config instanceof byte[] bytes) {
            try { return !parseLogicConfig(bytes).links().isEmpty(); }
            catch (IOException exception) { return true; }
        }
        return false;
    }

    private static boolean mapConfigReferencesFootprint(Object config, java.util.Set<Long> footprint) {
        if (config instanceof arc.math.geom.Point2 point) return footprint.contains(positionKey(point.x, point.y));
        if (config instanceof arc.math.geom.Point2[] points) {
            for (arc.math.geom.Point2 point : points) if (point != null && footprint.contains(positionKey(point.x, point.y))) return true;
        }
        if (config instanceof byte[] bytes) {
            try {
                for (LogicLinkData link : parseLogicConfig(bytes).links()) {
                    if (footprint.contains(positionKey(link.x(), link.y()))) return true;
                }
            } catch (IOException exception) { return true; }
        }
        return false;
    }

    private static boolean safeLogicConfig(byte[] bytes) {
        try { parseLogicConfig(bytes); return true; }
        catch (IOException exception) { return false; }
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

    private static List<MovePosition> readMovePositions(JsonValue raw) throws SchematicTransformException {
        java.util.ArrayList<MovePosition> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<Long> sources = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 5_000 || !item.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            int fromX = item.getInt("from_x", Integer.MIN_VALUE);
            int fromY = item.getInt("from_y", Integer.MIN_VALUE);
            int toX = item.getInt("to_x", Integer.MIN_VALUE);
            int toY = item.getInt("to_y", Integer.MIN_VALUE);
            long source = positionKey(fromX, fromY);
            if (!validSchematicCoordinate(fromX, fromY) || !validSchematicCoordinate(toX, toY) || !sources.add(source)) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            result.add(new MovePosition(fromX, fromY, toX, toY));
        }
        return result;
    }

    private static List<RotatePosition> readRotatePositions(JsonValue raw) throws SchematicTransformException {
        java.util.ArrayList<RotatePosition> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<Long> unique = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 5_000 || !item.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            int x = item.getInt("x", Integer.MIN_VALUE);
            int y = item.getInt("y", Integer.MIN_VALUE);
            int quarters = item.getInt("rotation_quarters", 0);
            if (!validSchematicCoordinate(x, y) || quarters < 1 || quarters > 3 || !unique.add(positionKey(x, y))) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            result.add(new RotatePosition(x, y, quarters));
        }
        return result;
    }

    private static List<AddedBlock> readAddedBlocks(JsonValue raw) throws SchematicTransformException {
        java.util.ArrayList<AddedBlock> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 5_000 || !item.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            int x = item.getInt("x", Integer.MIN_VALUE);
            int y = item.getInt("y", Integer.MIN_VALUE);
            int rotation = item.getInt("rotation", 0);
            String block = item.getString("block", "");
            if (!validSchematicCoordinate(x, y) || rotation < 0 || rotation > 3
                || !block.matches("[a-zA-Z0-9_.:-]{1,191}")) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            Integer copyX = item.has("copy_from_x") ? item.getInt("copy_from_x") : null;
            Integer copyY = item.has("copy_from_y") ? item.getInt("copy_from_y") : null;
            if ((copyX == null) != (copyY == null) || (copyX != null && (!validSchematicCoordinate(copyX, copyY)))) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            JsonValue config = item.get("config"); String logicSource = item.has("logic_source") ? item.getString("logic_source") : null;
            if ((config != null && !config.isObject()) || (logicSource != null && (logicSource.length() > 32768 || logicSource.indexOf('\0') >= 0))) throw new SchematicTransformException("INVALID_SCHEMATIC_CONFIG");
            result.add(new AddedBlock(x, y, block, rotation, copyX, copyY, config, logicSource));
        }
        return result;
    }

    private static List<LogicConfigEdit> readLogicConfigEdits(JsonValue raw) throws SchematicTransformException {
        java.util.ArrayList<LogicConfigEdit> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<Long> unique = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 1_000 || !item.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            int x = item.getInt("x", Integer.MIN_VALUE);
            int y = item.getInt("y", Integer.MIN_VALUE);
            String source = item.getString("source", "");
            if (!validSchematicCoordinate(x, y) || source.length() > 32_768 || source.indexOf('\0') >= 0
                || !unique.add(positionKey(x, y))) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            result.add(new LogicConfigEdit(x, y, source));
        }
        return result;
    }

    private static List<SchematicConfigEdit> readSchematicConfigEdits(JsonValue raw) throws SchematicTransformException {
        java.util.ArrayList<SchematicConfigEdit> result = new java.util.ArrayList<>();
        if (raw == null) return result;
        java.util.HashSet<Long> unique = new java.util.HashSet<>();
        for (JsonValue item = raw.child; item != null; item = item.next) {
            if (result.size() >= 5_000 || !item.isObject()
                || !hasOnlyKeys(item, new String[]{"x", "y", "config"})) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            int x = item.getInt("x", Integer.MIN_VALUE);
            int y = item.getInt("y", Integer.MIN_VALUE);
            JsonValue config = item.get("config");
            if (!validSchematicCoordinate(x, y) || config == null || !config.isObject()
                || !unique.add(positionKey(x, y))) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            result.add(new SchematicConfigEdit(x, y, config));
        }
        return result;
    }

    private static boolean validSchematicCoordinate(int x, int y) {
        return x >= 0 && x < 128 && y >= 0 && y < 128;
    }

    private static long positionKey(int x, int y) {
        return (((long)x) << 32) ^ (y & 0xffffffffL);
    }

    record MovePosition(int fromX, int fromY, int toX, int toY) {}
    record RotatePosition(int x, int y, int quarters) {}
    record AddedBlock(int x, int y, String block, int rotation, Integer copyX, Integer copyY, JsonValue config, String logicSource) {
        AddedBlock(int x, int y, String block, int rotation, Integer copyX, Integer copyY) { this(x, y, block, rotation, copyX, copyY, null, null); }
        AddedBlock(int x, int y, String block, int rotation) { this(x, y, block, rotation, null, null, null, null); }
    }
    record LogicConfigEdit(int x, int y, String source) {}
    record SchematicConfigEdit(int x, int y, JsonValue config) {}

    /**
     * Mindustry v160.5 Schematics.write delegates configuration serialization
     * to TypeIO.writeObject. Keep this allowlist narrower than TypeIO: live
     * Building/Unit references, Bullet/Seq values, unknown classes and opaque
     * byte arrays are never accepted for schematic editing.
     */
    private static boolean isSafeSchematicConfig(Object config, Block block, int x, int y, int width, int height) {
        if (config == null) return true;
        if (!hasRegisteredConfigAssignable(block, config.getClass())) return false;
        if (config instanceof Integer || config instanceof Long || config instanceof Float || config instanceof Double
            || config instanceof Boolean || config instanceof String) return true;
        if (config instanceof mindustry.ctype.MappableContent content) {
            return content.getContentType() != null
                && Vars.content.getByName(content.getContentType(), content.name) == content;
        }
        if (config instanceof mindustry.content.TechTree.TechNode node) {
            return node.content != null && node.content.techNode == node
                && Vars.content.getByName(node.content.getContentType(), node.content.name) == node.content;
        }
        if (config instanceof Point2 point) return referencePointInBounds(point, x, y, width, height);
        if (config instanceof Point2[] points) {
            if (points.length > 255) return false;
            for (Point2 point : points) if (point == null || !referencePointInBounds(point, x, y, width, height)) return false;
            return true;
        }
        if (config instanceof arc.struct.IntSeq values) return values.size <= 1_000;
        if (config instanceof int[] values) return values.length <= 1_000;
        if (config instanceof boolean[] values) return values.length <= 1_000;
        if (config instanceof arc.math.geom.Vec2 vector) return vectorInBounds(vector, width, height);
        if (config instanceof arc.math.geom.Vec2[] vectors) {
            if (vectors.length > 1_000) return false;
            for (arc.math.geom.Vec2 vector : vectors) if (vector == null || !vectorInBounds(vector, width, height)) return false;
            return true;
        }
        if (config instanceof mindustry.game.Team team) return mindustry.game.Team.get(team.id) == team;
        if (config instanceof mindustry.logic.LAccess access) return mindustry.logic.LAccess.valueOf(access.name()) == access;
        if (config instanceof mindustry.ai.UnitCommand command) {
            return Vars.content.getByName(ContentType.unit, command.name) == command;
        }
        if (config instanceof byte[] bytes) {
            if (!(block instanceof LogicBlock)) return false;
            try { parseLogicConfig(bytes); return true; }
            catch (IOException exception) { return false; }
        }
        return false;
    }

    private static boolean referencePointInBounds(Point2 point, int anchorX, int anchorY, int width, int height) {
        long targetX = (long)anchorX + point.x;
        long targetY = (long)anchorY + point.y;
        return targetX >= 0 && targetY >= 0 && targetX < width && targetY < height;
    }

    private static boolean vectorInBounds(arc.math.geom.Vec2 vector, int width, int height) {
        return Float.isFinite(vector.x) && Float.isFinite(vector.y)
            && vector.x >= 0f && vector.y >= 0f && vector.x < width && vector.y < height;
    }

    private static Object decodeSchematicConfig(JsonValue value, Block block, int x, int y, int width, int height)
        throws SchematicTransformException {
        String type = value.getString("type", "");
        try {
            Object decoded;
            switch (type) {
                case "none" -> {
                    if (!hasOnlyKeys(value, new String[]{"type"}) || !hasRegisteredConfig(block, Void.class, void.class)) throw new IllegalArgumentException();
                    return null;
                }
                case "integer" -> {
                    requireConfigKeys(value, "type", "value");
                    if (!value.get("value").isLong()) throw new IllegalArgumentException();
                    long number = value.getLong("value", Long.MIN_VALUE);
                    if (number < Integer.MIN_VALUE || number > Integer.MAX_VALUE || !hasRegisteredConfig(block, Integer.class)) throw new IllegalArgumentException();
                    decoded = (int)number;
                }
                case "color" -> {
                    requireConfigKeys(value, "type", "value");
                    String hex = value.getString("value", "");
                    if (!"illuminator".equals(block.name) || !hex.matches("#[0-9a-fA-F]{8}") || !hasRegisteredConfig(block, Integer.class)) throw new IllegalArgumentException();
                    decoded = (int)Long.parseLong(hex.substring(1), 16);
                }
                case "long" -> {
                    requireConfigKeys(value, "type", "value");
                    String number = value.getString("value", "");
                    if (!number.matches("-?(0|[1-9][0-9]{0,18})") || !hasRegisteredConfig(block, Long.class)) throw new IllegalArgumentException();
                    decoded = Long.parseLong(number);
                }
                case "float" -> {
                    requireConfigKeys(value, "type", "value");
                    double number = value.getDouble("value", Double.NaN);
                    if (!Double.isFinite(number) || Math.abs(number) > 1_000_000d || !hasRegisteredConfig(block, Float.class)) throw new IllegalArgumentException();
                    decoded = (float)number;
                }
                case "double" -> {
                    requireConfigKeys(value, "type", "value");
                    double number = value.getDouble("value", Double.NaN);
                    if (!Double.isFinite(number) || Math.abs(number) > 1_000_000_000d || !hasRegisteredConfig(block, Double.class)) throw new IllegalArgumentException();
                    decoded = number;
                }
                case "boolean" -> {
                    requireConfigKeys(value, "type", "value");
                    if (!value.get("value").isBoolean() || !hasRegisteredConfig(block, Boolean.class)) throw new IllegalArgumentException();
                    decoded = value.getBoolean("value");
                }
                case "text" -> {
                    requireConfigKeys(value, "type", "value");
                    String text = value.getString("value", "");
                    if (text.length() > 1_200 || text.indexOf('\0') >= 0 || !hasRegisteredConfig(block, String.class)) throw new IllegalArgumentException();
                    decoded = text;
                }
                case "content" -> {
                    requireConfigKeys(value, "type", "content_type", "name");
                    String contentName = value.getString("name", "");
                    ContentType contentType = ContentType.valueOf(value.getString("content_type", ""));
                    if (!contentName.matches("[a-zA-Z0-9_.:-]{1,191}")) throw new IllegalArgumentException();
                    Object content = Vars.content.getByName(contentType, contentName);
                    if (!(content instanceof mindustry.ctype.MappableContent) || !contentType.contentClass.isInstance(content)
                        || !hasRegisteredConfigAssignable(block, content.getClass())) throw new IllegalArgumentException();
                    decoded = content;
                }
                case "tech_node" -> {
                    requireConfigKeys(value, "type", "content_type", "name");
                    ContentType contentType = ContentType.valueOf(value.getString("content_type", ""));
                    String contentName = value.getString("name", "");
                    Object content = Vars.content.getByName(contentType, contentName);
                    if (!(content instanceof mindustry.ctype.UnlockableContent unlockable) || unlockable.techNode == null
                        || !hasRegisteredConfig(block, mindustry.content.TechTree.TechNode.class)) throw new IllegalArgumentException();
                    decoded = unlockable.techNode;
                }
                case "point" -> {
                    requireConfigKeys(value, "type", "x", "y");
                    Point2 point = new Point2(value.getInt("x", Integer.MIN_VALUE), value.getInt("y", Integer.MIN_VALUE));
                    if (!hasRegisteredConfig(block, Point2.class) || !referencePointInBounds(point, x, y, width, height)) throw new IllegalArgumentException();
                    decoded = point;
                }
                case "point_array" -> {
                    requireConfigKeys(value, "type", "points");
                    JsonValue points = value.get("points");
                    if (points == null || !points.isArray() || points.size > 255 || !hasRegisteredConfig(block, Point2[].class)) throw new IllegalArgumentException();
                    Point2[] decodedPoints = new Point2[points.size];
                    int index = 0;
                    for (JsonValue point = points.child; point != null; point = point.next) {
                        if (!point.isObject() || !hasOnlyKeys(point, new String[]{"x", "y"})) throw new IllegalArgumentException();
                        Point2 decodedPoint = new Point2(point.getInt("x", Integer.MIN_VALUE), point.getInt("y", Integer.MIN_VALUE));
                        if (!referencePointInBounds(decodedPoint, x, y, width, height)) throw new IllegalArgumentException();
                        decodedPoints[index++] = decodedPoint;
                    }
                    decoded = decodedPoints;
                }
                case "int_seq", "int_array" -> {
                    requireConfigKeys(value, "type", "values");
                    JsonValue values = value.get("values");
                    if (values == null || !values.isArray() || values.size > 1_000) throw new IllegalArgumentException();
                    int[] numbers = new int[values.size];
                    int index = 0;
                    for (JsonValue item = values.child; item != null; item = item.next) {
                        if (!item.isLong() || item.asLong() < -16_384L || item.asLong() > 16_383L) throw new IllegalArgumentException();
                        numbers[index++] = item.asInt();
                    }
                    if (type.equals("int_seq")) {
                        if (!hasRegisteredConfig(block, arc.struct.IntSeq.class)) throw new IllegalArgumentException();
                        arc.struct.IntSeq sequence = new arc.struct.IntSeq(numbers.length);
                        for (int number : numbers) sequence.add(number);
                        decoded = sequence;
                    } else {
                        if (!hasRegisteredConfig(block, int[].class)) throw new IllegalArgumentException();
                        decoded = numbers;
                    }
                }
                case "boolean_array" -> {
                    requireConfigKeys(value, "type", "values");
                    JsonValue values = value.get("values");
                    if (values == null || !values.isArray() || values.size > 1_000 || !hasRegisteredConfig(block, boolean[].class)) throw new IllegalArgumentException();
                    boolean[] booleans = new boolean[values.size];
                    int index = 0;
                    for (JsonValue item = values.child; item != null; item = item.next) {
                        if (!item.isBoolean()) throw new IllegalArgumentException();
                        booleans[index++] = item.asBoolean();
                    }
                    decoded = booleans;
                }
                case "vec2" -> {
                    requireConfigKeys(value, "type", "x", "y");
                    arc.math.geom.Vec2 vector = new arc.math.geom.Vec2((float)value.getDouble("x", Double.NaN), (float)value.getDouble("y", Double.NaN));
                    if (!hasRegisteredConfig(block, arc.math.geom.Vec2.class) || !vectorInBounds(vector, width, height)) throw new IllegalArgumentException();
                    decoded = vector;
                }
                case "vec2_array" -> {
                    requireConfigKeys(value, "type", "points");
                    JsonValue points = value.get("points");
                    if (points == null || !points.isArray() || points.size > 1_000 || !hasRegisteredConfig(block, arc.math.geom.Vec2[].class)) throw new IllegalArgumentException();
                    arc.math.geom.Vec2[] vectors = new arc.math.geom.Vec2[points.size];
                    int index = 0;
                    for (JsonValue point = points.child; point != null; point = point.next) {
                        if (!point.isObject() || !hasOnlyKeys(point, new String[]{"x", "y"})) throw new IllegalArgumentException();
                        arc.math.geom.Vec2 vector = new arc.math.geom.Vec2((float)point.getDouble("x", Double.NaN), (float)point.getDouble("y", Double.NaN));
                        if (!vectorInBounds(vector, width, height)) throw new IllegalArgumentException();
                        vectors[index++] = vector;
                    }
                    decoded = vectors;
                }
                case "team" -> {
                    requireConfigKeys(value, "type", "name");
                    String name = value.getString("name", "");
                    decoded = java.util.Arrays.stream(mindustry.game.Team.all).filter(team -> team != null && team.name.equals(name)).findFirst().orElseThrow();
                    if (!hasRegisteredConfig(block, mindustry.game.Team.class)) throw new IllegalArgumentException();
                }
                case "l_access" -> {
                    requireConfigKeys(value, "type", "name");
                    decoded = mindustry.logic.LAccess.valueOf(value.getString("name", ""));
                    if (!hasRegisteredConfig(block, mindustry.logic.LAccess.class)) throw new IllegalArgumentException();
                }
                case "unit_command" -> {
                    requireConfigKeys(value, "type", "name");
                    String name = value.getString("name", "");
                    decoded = Vars.content.getByName(ContentType.unitCommand, name);
                    if (!(decoded instanceof mindustry.ai.UnitCommand) || !hasRegisteredConfig(block, mindustry.ai.UnitCommand.class)) throw new IllegalArgumentException();
                }
                default -> throw new IllegalArgumentException();
            }
            if (!isSafeSchematicConfig(decoded, block, x, y, width, height)) throw new IllegalArgumentException();
            return decoded;
        } catch (Exception exception) {
            throw new SchematicTransformException("INVALID_SCHEMATIC_CONFIG");
        }
    }

    private static boolean hasRegisteredConfig(Block block, Class<?>... classes) {
        if (block.configurations == null) return false;
        for (Class<?> type : classes) if (block.configurations.containsKey(type)) return true;
        return false;
    }

    private static boolean hasRegisteredConfigAssignable(Block block, Class<?> actualClass) {
        if (block.configurations == null) return false;
        for (var entry : block.configurations.entries()) {
            if (entry.key == actualClass || entry.key.isAssignableFrom(actualClass)) return true;
        }
        return false;
    }

    private static void requireConfigKeys(JsonValue value, String... keys) {
        if (!hasOnlyKeys(value, keys)) throw new IllegalArgumentException();
        for (String key : keys) if (value.get(key) == null) throw new IllegalArgumentException();
    }

    private static String schematicConfigJson(Object config, Block block, int x, int y, int width, int height) {
        if (config == null) return hasRegisteredConfig(block, Void.class, void.class) ? "{\"type\":\"none\"}" : null;
        if (!isSafeSchematicConfig(config, block, x, y, width, height)) return null;
        if (config instanceof byte[] bytes) {
            try {
                LogicConfigData logic = parseLogicConfig(bytes);
                StringBuilder links = new StringBuilder("[");
                for (int index = 0; index < logic.links().size(); index++) {
                    LogicLinkData link = logic.links().get(index);
                    if (index > 0) links.append(',');
                    links.append("{\"name\":").append(quote(link.name())).append(",\"x\":").append(link.x()).append(",\"y\":").append(link.y()).append('}');
                }
                return "{\"type\":\"logic\",\"source\":" + quote(logic.source()) + ",\"links\":" + links.append(']') + "}";
            } catch (IOException exception) { return null; }
        }
        if (config instanceof Integer number) {
            return "illuminator".equals(block.name)
                ? "{\"type\":\"color\",\"value\":" + quote(String.format(java.util.Locale.ROOT, "#%08x", Integer.toUnsignedLong(number))) + "}"
                : "{\"type\":\"integer\",\"value\":" + number + "}";
        }
        if (config instanceof Long number) return "{\"type\":\"long\",\"value\":" + quote(number.toString()) + "}";
        if (config instanceof Float number) return "{\"type\":\"float\",\"value\":" + number(number.doubleValue()) + "}";
        if (config instanceof Double number) return "{\"type\":\"double\",\"value\":" + number(number) + "}";
        if (config instanceof Boolean flag) return "{\"type\":\"boolean\",\"value\":" + flag + "}";
        if (config instanceof String text) return "{\"type\":\"text\",\"value\":" + quote(text) + "}";
        if (config instanceof mindustry.ctype.MappableContent content) {
            return "{\"type\":\"content\",\"content_type\":" + quote(content.getContentType().name()) + ",\"name\":" + quote(content.name) + "}";
        }
        if (config instanceof mindustry.content.TechTree.TechNode node) {
            return "{\"type\":\"tech_node\",\"content_type\":" + quote(node.content.getContentType().name()) + ",\"name\":" + quote(node.content.name) + "}";
        }
        if (config instanceof Point2 point) return "{\"type\":\"point\",\"x\":" + point.x + ",\"y\":" + point.y + "}";
        if (config instanceof Point2[] points) {
            StringBuilder result = new StringBuilder("{\"type\":\"point_array\",\"points\":[");
            for (int index = 0; index < points.length; index++) { if (index > 0) result.append(','); result.append("{\"x\":").append(points[index].x).append(",\"y\":").append(points[index].y).append('}'); }
            return result.append("]}").toString();
        }
        if (config instanceof arc.struct.IntSeq values) {
            StringBuilder result = new StringBuilder("{\"type\":\"int_seq\",\"values\":[");
            for (int index = 0; index < values.size; index++) { if (index > 0) result.append(','); result.append(values.items[index]); }
            return result.append("]}").toString();
        }
        if (config instanceof int[] values) return "{\"type\":\"int_array\",\"values\":" + integerArray(values) + "}";
        if (config instanceof boolean[] values) return "{\"type\":\"boolean_array\",\"values\":" + booleanArray(values) + "}";
        if (config instanceof arc.math.geom.Vec2 vector) return "{\"type\":\"vec2\",\"x\":" + number(vector.x) + ",\"y\":" + number(vector.y) + "}";
        if (config instanceof arc.math.geom.Vec2[] values) {
            StringBuilder result = new StringBuilder("{\"type\":\"vec2_array\",\"points\":[");
            for (int index = 0; index < values.length; index++) { if (index > 0) result.append(','); result.append("{\"x\":").append(number(values[index].x)).append(",\"y\":").append(number(values[index].y)).append('}'); }
            return result.append("]}").toString();
        }
        if (config instanceof mindustry.game.Team team) return "{\"type\":\"team\",\"name\":" + quote(team.name) + "}";
        if (config instanceof mindustry.logic.LAccess access) return "{\"type\":\"l_access\",\"name\":" + quote(access.name()) + "}";
        if (config instanceof mindustry.ai.UnitCommand command) return "{\"type\":\"unit_command\",\"name\":" + quote(command.name) + "}";
        return null;
    }

    private static boolean hasConfigOptions(Block block) {
        return block.configurations != null && block.configurations.size > 0;
    }

    private static String schematicConfigTypesJson(Block block) {
        if (block.configurations == null || block.configurations.size == 0) return "[]";
        java.util.TreeMap<String, String> options = new java.util.TreeMap<>();
        for (var entry : block.configurations.entries()) {
            Class<?> type = entry.key;
            String descriptor = schematicConfigTypeDescriptor(block, type);
            if (descriptor != null) options.put(descriptor, descriptor);
        }
        return "[" + String.join(",", options.values()) + "]";
    }

    private static String schematicConfigTypeDescriptor(Block block, Class<?> type) {
        if (type == Void.class || type == void.class) return "{\"type\":\"none\"}";
        if (type == Integer.class) return "illuminator".equals(block.name) ? "{\"type\":\"color\"}" : "{\"type\":\"integer\"}";
        if (type == Long.class) return "{\"type\":\"long\"}";
        if (type == Float.class) return "{\"type\":\"float\"}";
        if (type == Double.class) return "{\"type\":\"double\"}";
        if (type == Boolean.class) return "{\"type\":\"boolean\"}";
        if (type == String.class) return "{\"type\":\"text\"}";
        if (type == Point2.class) return "{\"type\":\"point\"}";
        if (type == Point2[].class) return "{\"type\":\"point_array\"}";
        if (type == arc.struct.IntSeq.class) return "{\"type\":\"int_seq\"}";
        if (type == int[].class) return "{\"type\":\"int_array\"}";
        if (type == boolean[].class) return "{\"type\":\"boolean_array\"}";
        if (type == arc.math.geom.Vec2.class) return "{\"type\":\"vec2\"}";
        if (type == arc.math.geom.Vec2[].class) return "{\"type\":\"vec2_array\"}";
        if (type == mindustry.game.Team.class) return "{\"type\":\"team\"}";
        if (type == mindustry.logic.LAccess.class) return "{\"type\":\"l_access\"}";
        if (type == mindustry.content.TechTree.TechNode.class) return "{\"type\":\"tech_node\"}";
        if (type == byte[].class && block instanceof LogicBlock) return "{\"type\":\"logic\"}";
        if (mindustry.ctype.MappableContent.class.isAssignableFrom(type)) {
            for (ContentType contentType : ContentType.all) {
                if (contentType.contentClass == type) {
                    return "{\"type\":\"content\",\"content_type\":" + quote(contentType.name()) + "}";
                }
            }
        }
        return null;
    }

    private static String integerArray(int[] values) {
        StringBuilder result = new StringBuilder("[");
        for (int index = 0; index < values.length; index++) { if (index > 0) result.append(','); result.append(values[index]); }
        return result.append(']').toString();
    }

    private static String booleanArray(boolean[] values) {
        StringBuilder result = new StringBuilder("[");
        for (int index = 0; index < values.length; index++) { if (index > 0) result.append(','); result.append(values[index]); }
        return result.append(']').toString();
    }

    /**
     * Decodes with Mindustry's official reader and serializes with its official
     * writer. Unknown block/content definitions are rejected because read()
     * deliberately replaces unknown blocks with air and could otherwise lose data.
     */
    static byte[] transformSchematicBytes(Path input, int rotationQuarterTurns, boolean mirrorX, List<Point2> deletePositions) throws IOException, SchematicTransformException {
        return transformSchematicBytes(input, rotationQuarterTurns, mirrorX, deletePositions, List.of(), List.of(), List.of(), List.of());
    }

    static byte[] transformSchematicBytes(Path input, int rotationQuarterTurns, boolean mirrorX,
        List<Point2> deletePositions, List<MovePosition> movePositions, List<AddedBlock> addedBlocks,
        List<LogicConfigEdit> logicConfigs)
        throws IOException, SchematicTransformException {
        return transformSchematicBytes(input, rotationQuarterTurns, mirrorX, deletePositions,
            movePositions, addedBlocks, logicConfigs, List.of());
    }

    static byte[] transformSchematicBytes(Path input, int rotationQuarterTurns, boolean mirrorX,
        List<Point2> deletePositions, List<MovePosition> movePositions, List<AddedBlock> addedBlocks,
        List<LogicConfigEdit> logicConfigs, List<SchematicConfigEdit> configEdits)
        throws IOException, SchematicTransformException {
        return transformSchematicBytes(input, rotationQuarterTurns, mirrorX, deletePositions, movePositions,
            List.of(), addedBlocks, logicConfigs, configEdits);
    }

    static byte[] transformSchematicBytes(Path input, int rotationQuarterTurns, boolean mirrorX,
        List<Point2> deletePositions, List<MovePosition> movePositions, List<RotatePosition> rotatePositions,
        List<AddedBlock> addedBlocks, List<LogicConfigEdit> logicConfigs, List<SchematicConfigEdit> configEdits)
        throws IOException, SchematicTransformException {
        if (rotationQuarterTurns < 0 || rotationQuarterTurns > 3) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
        validateInflated(input, MAX_INFLATED_SCHEMATIC_BYTES, 5);
        List<String> unknown = unknownSchematicEditContent(input);
        if (!unknown.isEmpty()) throw new SchematicTransformException("UNSUPPORTED_SCHEMATIC_CONTENT");

        Schematic source = Schematics.read(new Fi(input.toFile()));
        validateSchematicSize(source);
        java.util.HashSet<Long> requested = new java.util.HashSet<>();
        for (Point2 position : deletePositions) {
            if (position.x < 0 || position.y < 0 || position.x >= source.width || position.y >= source.height
                || !requested.add(positionKey(position.x, position.y))) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
        }
        if (deletePositions.size() > 10_000 || movePositions.size() > 5_000 || rotatePositions.size() > 5_000 || addedBlocks.size() > 5_000 || logicConfigs.size() > 1_000 || configEdits.size() > 5_000
            || deletePositions.size() + movePositions.size() + rotatePositions.size() + addedBlocks.size() + logicConfigs.size() + configEdits.size() > 10_000) {
            throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
        }
        java.util.HashMap<Long, Schematic.Stile> sourceTiles = new java.util.HashMap<>();
        for (Schematic.Stile tile : source.tiles) {
            if (tile.x < 0 || tile.y < 0 || tile.x >= source.width || tile.y >= source.height
                || sourceTiles.put(positionKey(tile.x, tile.y), tile) != null) {
                throw new SchematicTransformException("INVALID_SCHEMATIC");
            }
            if (!isSafeSchematicConfig(tile.config, tile.block, tile.x, tile.y, source.width, source.height)) {
                throw new SchematicTransformException("UNSUPPORTED_SCHEMATIC_CONFIG");
            }
        }
        java.util.HashSet<Long> rotatedPositions = new java.util.HashSet<>();
        for (RotatePosition edit : rotatePositions) {
            long key = positionKey(edit.x(), edit.y());
            Schematic.Stile tile = sourceTiles.get(key);
            if (tile == null || requested.contains(key) || !rotatedPositions.add(key) || !tile.block.rotate
                || !isSafeSchematicRotationConfig(tile.config)) {
                throw new SchematicTransformException(tile == null || !tile.block.rotate
                    ? "INVALID_SCHEMATIC_OPERATION" : "UNSUPPORTED_SCHEMATIC_CONFIG");
            }
            tile.rotation = (byte)((tile.rotation + edit.quarters()) & 3);
        }
        for (LogicConfigEdit edit : logicConfigs) {
            Schematic.Stile tile = sourceTiles.get(positionKey(edit.x(), edit.y()));
            if (tile == null || !(tile.block instanceof LogicBlock) || !(tile.config instanceof byte[])) {
                throw new SchematicTransformException("UNSUPPORTED_LOGIC_CONFIG");
            }
            tile.config = editLogicSource(tile.config, edit.source());
        }
        for (SchematicConfigEdit edit : configEdits) {
            Schematic.Stile tile = sourceTiles.get(positionKey(edit.x(), edit.y()));
            if (tile == null) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            tile.config = decodeSchematicConfig(edit.config(), tile.block, tile.x, tile.y, source.width, source.height);
        }
        java.util.HashMap<Long, MovePosition> movesBySource = new java.util.HashMap<>();
        java.util.HashSet<Long> changedSources = new java.util.HashSet<>(requested);
        java.util.HashSet<Long> destinations = new java.util.HashSet<>();
        for (MovePosition move : movePositions) {
            long from = positionKey(move.fromX(), move.fromY());
            long to = positionKey(move.toX(), move.toY());
            Schematic.Stile tile = sourceTiles.get(from);
            if (tile == null || !changedSources.add(from) || !destinations.add(to)) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
            movesBySource.put(from, move);
        }
        java.util.HashSet<Long> finalPositions = new java.util.HashSet<>();
        for (var entry : sourceTiles.entrySet()) {
            if (!changedSources.contains(entry.getKey())
                && !reserveSchematicFootprint(finalPositions, entry.getValue().block, entry.getValue().x, entry.getValue().y, source.width, source.height)) {
                throw new SchematicTransformException("INVALID_SCHEMATIC");
            }
        }
        for (MovePosition move : movePositions) {
            long to = positionKey(move.toX(), move.toY());
            Schematic.Stile moving = sourceTiles.get(positionKey(move.fromX(), move.fromY()));
            if (move.toX() >= source.width || move.toY() >= source.height
                || !reserveSchematicFootprint(finalPositions, moving.block, move.toX(), move.toY(), source.width, source.height)) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            }
        }
        for (AddedBlock add : addedBlocks) {
            if (add.x() >= source.width || add.y() >= source.height) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
            Block block = Vars.content.getByName(ContentType.block, add.block());
            long position = positionKey(add.x(), add.y());
            if (block == null || isA(block, "LegacyBlock")
                || !reserveSchematicFootprint(finalPositions, block, add.x(), add.y(), source.width, source.height)) {
                throw new SchematicTransformException(block == null || isA(block, "LegacyBlock")
                    ? "UNSUPPORTED_SCHEMATIC_CONTENT" : "INVALID_SCHEMATIC_OPERATION");
            }
        }
        for (Point2 position : deletePositions) {
            if (!sourceTiles.containsKey(positionKey(position.x, position.y))) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
        }
        for (MovePosition move : movePositions) {
            if (!sourceTiles.containsKey(positionKey(move.fromX(), move.fromY()))) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
        }

        Seq<Schematic.Stile> editedTiles = new Seq<>(source.tiles.size + addedBlocks.size());
        for (Schematic.Stile tile : source.tiles) {
            long position = positionKey(tile.x, tile.y);
            if (requested.contains(position)) continue;
            MovePosition move = movesBySource.get(position);
            if (move == null) editedTiles.add(tile);
            else {
                Schematic.Stile moved = tile.copy();
                int dx = move.toX() - move.fromX();
                int dy = move.toY() - move.fromY();
                if (tile.config instanceof byte[] && tile.block instanceof LogicBlock) {
                    try { parseLogicConfig(tile.config); }
                    catch (IOException exception) { throw new SchematicTransformException("UNSUPPORTED_LOGIC_CONFIG"); }
                }
                moved.config = tile.block.pointConfig(tile.config, point -> { point.x -= dx; point.y -= dy; });
                moved.x = (short)move.toX();
                moved.y = (short)move.toY();
                editedTiles.add(moved);
            }
        }
        for (AddedBlock add : addedBlocks) {
            Block block = Vars.content.getByName(ContentType.block, add.block());
            Object config = null;
            if (add.copyX() != null) {
                Schematic.Stile original = sourceTiles.get(positionKey(add.copyX(), add.copyY()));
                if (original == null || original.block != block) throw new SchematicTransformException("INVALID_SCHEMATIC_OPERATION");
                config = block.pointConfig(add.config() == null ? original.config : decodeSchematicConfig(add.config(), block, add.copyX(), add.copyY(), source.width, source.height), point -> {
                    // Connections inside a copied group travel with the group; external links keep their target.
                    int targetX = add.copyX() + point.x, targetY = add.copyY() + point.y;
                    boolean internal = false;
                    for (AddedBlock peer : addedBlocks) if (peer.copyX() != null && peer.copyX() == targetX && peer.copyY() == targetY
                        && peer.x() - peer.copyX() == add.x() - add.copyX() && peer.y() - peer.copyY() == add.y() - add.copyY()) { internal = true; break; }
                    if (!internal) { point.x -= add.x() - add.copyX(); point.y -= add.y() - add.copyY(); }
                });
            }
            if (add.config() != null && add.copyX() == null) config = decodeSchematicConfig(add.config(), block, add.x(), add.y(), source.width, source.height);
            if (add.logicSource() != null) {
                if (!(block instanceof LogicBlock)) throw new SchematicTransformException("UNSUPPORTED_LOGIC_CONFIG");
                if (config == null) config = ((LogicBlock)block).compress(add.logicSource(), new arc.struct.Seq<mindustry.world.blocks.logic.LogicBlock.LogicLink>());
                else config = editLogicSource(config, add.logicSource());
            }
            editedTiles.add(new Schematic.Stile(block, add.x(), add.y(), config, (byte)add.rotation()));
        }
        source.tiles.clear();
        source.tiles.addAll(editedTiles);

        StringMap tags = new StringMap();
        tags.putAll(source.tags);
        Seq<String> labels = new Seq<>();
        if (source.labels != null) labels.addAll(source.labels);
        Schematic result = copySchematic(source);
        for (int turn = 0; turn < rotationQuarterTurns; turn++) {
            // Official rotation pivots around integer width/2,height/2. Translate
            // that pivot back into the swapped rectangle, including edge tiles.
            int ox = result.width / 2, oy = result.height / 2;
            int shiftX = result.height - 1 - ox - oy, shiftY = ox - oy;
            Schematic before = result;
            java.util.Map<Long, Block> blocks = new java.util.HashMap<>();
            for (Schematic.Stile tile : before.tiles) blocks.put(positionKey(tile.x, tile.y), tile.block);
            result = copySchematic(Schematics.rotate(before, 1));
            for (int index = 0; index < result.tiles.size; index++) {
                Schematic.Stile tile = result.tiles.get(index), original = before.tiles.get(index);
                tile.x += shiftX; tile.y += shiftY;
                tile.config = transformedRelativeConfig(original, blocks, false);
            }
        }
        result.tags.clear();
        result.tags.putAll(tags);
        result.labels.clear();
        result.labels.addAll(labels);
        if (mirrorX) mirrorSchematicX(result);
        for (Schematic.Stile tile : result.tiles) {
            if (tile.x < 0 || tile.y < 0 || tile.x >= result.width || tile.y >= result.height) {
                throw new SchematicTransformException("INVALID_SCHEMATIC");
            }
            if (!isSafeSchematicConfig(tile.config, tile.block, tile.x, tile.y, result.width, result.height)) {
                throw new SchematicTransformException("INVALID_SCHEMATIC_CONFIG");
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

    private static boolean isSafeSchematicRotationConfig(Object config) {
        return config == null || config instanceof Number || config instanceof Boolean || config instanceof String
            || config instanceof mindustry.ctype.MappableContent;
    }

    /** Reserve the exact tile footprint used by Mindustry for a BuildPlan. */
    private static boolean reserveSchematicFootprint(java.util.Set<Long> occupied, Block block, int anchorX, int anchorY, int width, int height) {
        int left = anchorX + block.sizeOffset;
        int bottom = anchorY + block.sizeOffset;
        for (int x = left; x < left + block.size; x++) {
            for (int y = bottom; y < bottom + block.size; y++) {
                if (x < 0 || y < 0 || x >= width || y >= height || !occupied.add(positionKey(x, y))) return false;
            }
        }
        return true;
    }

    private static boolean isSafeSchematicSize(Schematic schematic) {
        if (schematic == null || schematic.tiles == null || schematic.width <= 0 || schematic.height <= 0
            || schematic.width > 128 || schematic.height > 128) return false;
        long area = (long)schematic.width * schematic.height;
        return area > 0 && area <= MAX_SCHEMATIC_TILES && schematic.tiles.size <= area;
    }

    static void validateSchematicSize(Schematic schematic) throws SchematicTransformException {
        if (!isSafeSchematicSize(schematic)) throw new SchematicTransformException("INVALID_SCHEMATIC_SIZE");
    }

    private static boolean isLogicProcessor(String name) {
        return name != null && name.toLowerCase(java.util.Locale.ROOT).contains("processor");
    }

    private static LogicConfigData parseLogicConfig(Object raw) throws IOException {
        if (!(raw instanceof byte[] bytes) || bytes.length == 0 || bytes.length > 16_000) throw new IOException("unsupported logic config bytes");
        try (DataInputStream data = new DataInputStream(new InflaterInputStream(new java.io.ByteArrayInputStream(bytes)))) {
            int version = data.readUnsignedByte();
            if (version != 1) throw new IOException("unsupported logic config version");
            int sourceLength = data.readInt();
            if (sourceLength < 0 || sourceLength > 100_000) throw new IOException("invalid logic source length");
            byte[] source = new byte[sourceLength];
            data.readFully(source);
            int count = data.readInt();
            if (count < 0 || count > 6_000) throw new IOException("invalid logic link count");
            java.util.ArrayList<LogicLinkData> links = new java.util.ArrayList<>(count);
            for (int index = 0; index < count; index++) {
                String name = data.readUTF();
                int x = data.readShort();
                int y = data.readShort();
                links.add(new LogicLinkData(name, x, y));
            }
            if (data.read() != -1) throw new IOException("trailing logic config bytes");
            return new LogicConfigData(new String(source, StandardCharsets.UTF_8), links);
        }
    }

    private static byte[] editLogicSource(Object raw, String source) throws SchematicTransformException {
        try {
            LogicConfigData original = parseLogicConfig(raw);
            Seq<LogicBlock.LogicLink> links = new Seq<>(original.links().size());
            for (LogicLinkData link : original.links()) links.add(new LogicBlock.LogicLink(link.x(), link.y(), link.name(), false));
            byte[] encoded = LogicBlock.compress(source, links);
            if (encoded.length > 16_000) throw new SchematicTransformException("INVALID_LOGIC_SOURCE");
            return encoded;
        } catch (SchematicTransformException exception) {
            throw exception;
        } catch (IOException exception) {
            throw new SchematicTransformException("UNSUPPORTED_LOGIC_CONFIG");
        }
    }

    private record LogicLinkData(String name, int x, int y) {}
    private record LogicConfigData(String source, List<LogicLinkData> links) {}

    private static LogicConfigMetadata logicConfigMetadata(Object raw, int sourceBudget, int linkBudget) {
        try {
            LogicConfigData data = parseLogicConfig(raw);
            if (data.source().length() > 32_768 || data.source().length() > sourceBudget || data.links().size() > linkBudget) {
                return new LogicConfigMetadata(null, 0, 0, false);
            }
            StringBuilder links = new StringBuilder("[");
            boolean first = true;
            for (LogicLinkData link : data.links()) {
                if (!first) links.append(',');
                first = false;
                links.append("{\"name\":").append(quote(link.name()))
                    .append(",\"x\":").append(link.x()).append(",\"y\":").append(link.y()).append('}');
            }
            links.append(']');
            String json = "{\"type\":\"logic\",\"source\":" + quote(data.source()) + ",\"links\":" + links + ",\"format_version\":1}";
            return new LogicConfigMetadata(json, data.source().length(), data.links().size(), true);
        } catch (Exception ignored) {
            return new LogicConfigMetadata(null, 0, 0, false);
        }
    }

    private record LogicConfigMetadata(String json, int sourceChars, int linkCount, boolean available) {}

    private static Schematic copySchematic(Schematic source) {
        Seq<Schematic.Stile> tiles = new Seq<>(source.tiles.size);
        for (Schematic.Stile tile : source.tiles) tiles.add(tile.copy());
        StringMap tags = new StringMap();
        tags.putAll(source.tags);
        Schematic copy = new Schematic(tiles, tags, source.width, source.height);
        if (source.labels != null) copy.labels.addAll(source.labels);
        return copy;
    }

    /** References address anchors, whose half-tile offset differs for even-sized blocks. */
    private static Object transformedRelativeConfig(Schematic.Stile tile, java.util.Map<Long, Block> blocks, boolean mirror) {
        int sourceParity = tile.block.size % 2 == 0 ? 1 : 0;
        return BuildPlan.pointConfig(tile.block, tile.config, point -> {
            Block target = blocks.get(positionKey(tile.x + point.x, tile.y + point.y));
            int targetParity = target != null && target.size % 2 == 0 ? 1 : 0;
            int oldX = point.x;
            point.x = (mirror ? -point.x : -point.y) + sourceParity - targetParity;
            if (!mirror) point.y = oldX;
        });
    }

    /** Horizontal reflection through the schematic's vertical centerline. */
    private static void mirrorSchematicX(Schematic schematic) {
        java.util.Map<Long, Block> blocks = new java.util.HashMap<>();
        for (Schematic.Stile tile : schematic.tiles) blocks.put(positionKey(tile.x, tile.y), tile.block);
        for (Schematic.Stile tile : schematic.tiles) {
            Object transformed = transformedRelativeConfig(tile, blocks, true);
            tile.x = (short)(schematic.width - 1 - tile.x - (tile.block.size % 2 == 0 ? 1 : 0));
            BuildPlan plan = new BuildPlan(tile.x, tile.y, tile.rotation, tile.block, tile.config);
            plan.config = transformed;
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
                java.util.ArrayList<String> unknown = new java.util.ArrayList<>();
                String contentMap = tags.get("contentMap");
                // Vanilla v160.5 schematics omit contentMap and store their
                // content references against the pinned runtime registry.
                // When a map is present (typically for modded content), validate
                // every entry before the official reader can remap it.
                if (contentMap != null) {
                    if (contentMap.isBlank()) throw new SchematicTransformException("INVALID_SCHEMATIC");
                    JsonValue mappedContent = JSON.parse(contentMap);
                    if (mappedContent == null || !mappedContent.isObject()) throw new SchematicTransformException("INVALID_SCHEMATIC");
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
        validateInflated(input, MAX_INFLATED_MAP_BYTES, 0);
        Map map = MapIO.createMap(new Fi(input.toFile()), true);
        SaveMeta storedMeta = SaveIO.getMeta(new Fi(input.toFile()));
        if (!isSafeMapSize(map.width, map.height)) {
            send(exchange, 422, error("UNSUPPORTED_MAP_SIZE"));
            return;
        }
        // In v160.5 this reads the saved preview_map tile graph itself (floor,
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
        validateInflated(input, MAX_INFLATED_SCHEMATIC_BYTES, 5);
        Schematic schematic = Schematics.read(new Fi(input.toFile()));
        if (!isSafeSchematicSize(schematic)) {
            send(exchange, 422, error("INVALID_SCHEMATIC_SIZE"));
            return;
        }
        List<String> unknownBlocks = unknownSchematicBlocks(input);
        byte[] header = Files.readAllBytes(input);
        int formatVersion = header.length > 4 ? header[4] & 0xff : -1;
        BufferedImage image = renderSchematicImage(schematic);
        String key = previewKey("schematic", hash);
        if (!ImageIO.write(image, "png", target(key).toFile())) throw new IOException("PNG writer unavailable");
        send(exchange, 200, result(schematicMetadata(schematic, unknownBlocks, formatVersion), key));
    }

    static BufferedImage renderSchematicImage(Schematic schematic) {
        if (!isSafeSchematicSize(schematic)) throw new IllegalArgumentException("schematic exceeds safe dimensions");
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
        String rulesJson = rulesJson(rules, map);
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
            return "{\"core_count\":0,\"cores\":[],\"core_teams\":[],\"tile_layers\":{\"objects_truncated\":false,\"object_catalog\":"
                + mapObjectCatalog() + "},\"tile_layers_truncated\":false}";
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
            terrain.add("{" + position + ",\"name\":" + quote(tile.floor().name)
                + ",\"overlay\":" + quote(tile.overlay() == null ? "air" : tile.overlay().name) + "}");
            mindustry.type.Item drop = tile.drop();
            if (drop != null) resources.add("{" + position + ",\"name\":" + quote(drop.name) + "}");
            if (tile.overlay().wallOre && tile.overlay().itemDrop != null) {
                ores.add("{" + position + ",\"name\":" + quote(tile.overlay().itemDrop.name) + "}");
            }
            if (tile.floor().liquidDrop != null) {
                liquids.add("{" + position + ",\"name\":" + quote(tile.floor().liquidDrop.name) + "}");
            }
            if (isA(tile.block(), "SpawnBlock")) {
                enemySpawns.add("{" + position + ",\"name\":" + quote(tile.block().name)
                    + ",\"size\":" + tile.block().size + ",\"size_offset\":" + tile.block().sizeOffset + ",\"editable\":true,\"movable\":true,\"deletable\":true,\"team_editable\":false}");
            }
            if (tile.isCenter() && tile.build != null) {
                mindustry.game.Team team = tile.team();
                String teamName = team == null ? "" : team.name;
                if (tile.build instanceof mindustry.world.blocks.storage.CoreBlock.CoreBuild) {
                    cores.add("{" + position + ",\"name\":" + quote(tile.block().name) + ",\"team\":" + quote(teamName)
                        + ",\"rotation\":" + tile.build.rotation + ",\"size\":" + tile.block().size
                        + ",\"size_offset\":" + tile.block().sizeOffset
                        + ",\"editable\":true,\"movable\":true,\"deletable\":true,\"team_editable\":true,\"rotatable\":" + tile.block().rotate + "}");
                    coreTeams.add(teamName);
                    count++;
                } else {
                    Object config = tile.build.config();
                    boolean configSafe = isSafeMapConfig(config, tile.block(), map.width, map.height);
                    boolean hasCoordinateLinks = config != null && hasMapCoordinateConfig(config);
                    boolean movable = configSafe && !hasCoordinateLinks && !isA(tile.block(), "LegacyBlock");
                    String reason = !configSafe ? "该建筑含有当前编辑器无法安全处理的配置。"
                        : hasCoordinateLinks ? "该建筑存在坐标连接，暂不能安全移动或删除。"
                            : isA(tile.block(), "LegacyBlock") ? "这是旧版或未知方块，在线编辑器不会修改它。" : "";
                    buildings.add("{" + position + ",\"name\":" + quote(tile.block().name) + ",\"team\":" + quote(teamName)
                        + ",\"rotation\":" + tile.build.rotation + ",\"size\":" + tile.block().size
                        + ",\"size_offset\":" + tile.block().sizeOffset
                        + ",\"editable\":" + configSafe + ",\"movable\":" + movable + ",\"deletable\":" + movable
                        + ",\"team_editable\":" + configSafe + ",\"rotatable\":" + (movable && tile.block().rotate)
                        + ",\"reason\":" + quote(reason) + "}");
                }
            }
        }
        JsonArrayBuilder teams = new JsonArrayBuilder(100);
        for (String team : coreTeams) {
            teams.add(quote(team));
        }
        boolean objectsTruncated = cores.truncated || enemySpawns.truncated || buildings.truncated;
        String tileLayers = "{\"terrain\":" + terrain + ",\"resources\":" + resources + ",\"ores\":" + ores
            + ",\"enemy_spawns\":" + enemySpawns + ",\"buildings\":" + buildings + ",\"player_area\":[]"
            + ",\"liquid\":" + liquids + ",\"objects_truncated\":" + objectsTruncated
            + ",\"object_catalog\":" + mapObjectCatalog() + "}";
        boolean truncated = cores.truncated || terrain.truncated || resources.truncated || ores.truncated || enemySpawns.truncated || buildings.truncated || liquids.truncated;
        return "{\"core_count\":" + count + ",\"cores\":" + cores + ",\"core_teams\":" + teams
            + ",\"tile_layers\":" + tileLayers + ",\"tile_layers_truncated\":" + truncated + "}";
    }

    private static String mapObjectCatalog() {
        JsonArrayBuilder cores = new JsonArrayBuilder(2_000);
        JsonArrayBuilder spawns = new JsonArrayBuilder(2_000);
        JsonArrayBuilder buildings = new JsonArrayBuilder(2_000);
        JsonArrayBuilder teams = new JsonArrayBuilder(256);
        for (Block block : Vars.content.blocks()) {
            if (block == null || isA(block, "LegacyBlock") || block.name == null) continue;
            String entry = quote(block.name);
            if (block instanceof mindustry.world.blocks.storage.CoreBlock) cores.add(entry);
            else if (isA(block, "SpawnBlock")) spawns.add(entry);
            else if (!block.isFloor() && block.newBuilding() != null) buildings.add(entry);
        }
        java.util.ArrayList<mindustry.game.Team> teamList = new java.util.ArrayList<>();
        for (mindustry.game.Team team : mindustry.game.Team.all) if (team != null) teamList.add(team);
        teamList.sort(java.util.Comparator.comparingInt(team -> team.id));
        for (mindustry.game.Team team : teamList) teams.add(quote(team.name));
        return "{\"cores\":" + cores + ",\"spawns\":" + spawns + ",\"buildings\":" + buildings + ",\"teams\":" + teams + "}";
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
        int logicSourceCharBudget = 1_000_000;
        int logicLinkBudget = 10_000;
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
                .append(",\"size\":").append(tile.block == null ? 1 : tile.block.size)
                .append(",\"size_offset\":").append(tile.block == null ? 0 : tile.block.sizeOffset);
            if (tile.block instanceof LogicBlock) {
                LogicConfigMetadata logic = logicConfigMetadata(tile.config, logicSourceCharBudget, logicLinkBudget);
                positions.append(",\"logic_source_available\":").append(logic.available())
                    .append(",\"config_editable\":").append(logic.available())
                    .append(",\"config_types\":").append(schematicConfigTypesJson(tile.block));
                if (logic.json() != null) positions.append(",\"config\":").append(logic.json());
                logicSourceCharBudget -= logic.sourceChars();
                logicLinkBudget -= logic.linkCount();
            } else if (tile.config != null) {
                String typedConfig = schematicConfigJson(tile.config, tile.block, tile.x, tile.y, schematic.width, schematic.height);
                positions.append(",\"config_editable\":").append(typedConfig != null)
                    .append(",\"config_types\":").append(schematicConfigTypesJson(tile.block));
                if (typedConfig != null) positions.append(",\"config\":").append(typedConfig);
            } else if (tile.block != null && hasConfigOptions(tile.block)) {
                positions.append(",\"config_editable\":true,\"config_types\":").append(schematicConfigTypesJson(tile.block));
            }
            positions.append('}');
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
     * v160.5 Block/consumer definitions already loaded by this renderer. The
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

    private static String rulesJson(mindustry.game.Rules rules, Map map) {
        String stored = map == null ? null : map.tags.get("rules");
        if (stored != null && !stored.isBlank()) {
            try {
                JsonValue raw = JSON.parse(stored);
                if (raw != null && raw.isObject()) return raw.toJson(JsonWriter.OutputType.json);
            } catch (Exception ignored) { /* use the typed projection below */ }
        }
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
    private static void validateInflated(Path file, long limit, long compressedPrefixBytes) throws IOException {
        try (var compressed = Files.newInputStream(file)) {
            long skipped = compressed.skip(compressedPrefixBytes);
            while (skipped < compressedPrefixBytes) {
                long next = compressed.skip(compressedPrefixBytes - skipped);
                if (next <= 0) throw new IOException("truncated compressed file");
                skipped += next;
            }
            try (var inflated = new InflaterInputStream(compressed)) {
                byte[] buffer = new byte[16 * 1024];
                long total = 0;
                int read;
                while ((read = inflated.read(buffer)) != -1) {
                    total += read;
                    if (total > limit) throw new IOException("inflated input exceeds safe limit");
                }
            }
        }
    }

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

        BufferedImage findUnit(String name) {
            BufferedImage sprite = regions.get("unit-" + name + "-ui");
            if (sprite == null) sprite = regions.get("unit-" + name);
            return sprite == null ? find(name) : sprite;
        }

        BufferedImage findStatus(String name) {
            BufferedImage sprite = regions.get("status-" + name + "-ui");
            if (sprite == null) sprite = regions.get("status-" + name);
            return sprite == null ? find(name) : sprite;
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
