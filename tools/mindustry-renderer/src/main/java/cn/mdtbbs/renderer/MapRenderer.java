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
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.Base64;
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
        send(exchange, 200, "{\"status\":\"ok\",\"mindustryVersion\":\"" + VERSION + "\"}");
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
        send(exchange, 200, result("{\"name\":" + quote(map.tags.get("name", "")) + ",\"author\":" + quote(map.tags.get("author", "")) + ",\"description\":" + quote(map.tags.get("description", "")) + ",\"width\":" + map.width + ",\"height\":" + map.height + ",\"spawns\":" + map.spawns + ",\"version\":" + map.version + ",\"build\":" + map.build + "}", key));
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
        for (Schematic.Stile tile : schematic.tiles) {
            int size = Math.max(1, tile.block.size) * tileSize;
            int x = padding + tile.x * tileSize - (size - tileSize) / 2;
            int y = padding + (schematic.height - tile.y - 1) * tileSize - (size - tileSize) / 2;
            graphics.setColor(new Color(tile.block.mapColor.r, tile.block.mapColor.g, tile.block.mapColor.b, tile.block.mapColor.a));
            graphics.fillRect(x, y, size, size);
        }
        graphics.dispose();
        String key = previewKey("schematic", hash);
        if (!ImageIO.write(image, "png", target(key).toFile())) throw new IOException("PNG writer unavailable");
        send(exchange, 200, result("{\"name\":" + quote(schematic.name()) + ",\"description\":" + quote(schematic.description()) + ",\"width\":" + schematic.width + ",\"height\":" + schematic.height + ",\"blocks\":" + schematic.tiles.size + "}", key));
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
}
