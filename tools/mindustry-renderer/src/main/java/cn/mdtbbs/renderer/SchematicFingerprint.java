package cn.mdtbbs.renderer;

import arc.util.serialization.Json;
import arc.util.serialization.JsonReader;
import arc.util.serialization.JsonValue;
import mindustry.game.Schematic;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.math.BigDecimal;

/** Stable exact and dihedral (rotation/reflection) fingerprints for schematic tiles. */
final class SchematicFingerprint {
    private SchematicFingerprint() {}

    static String exact(Schematic schematic) {
        return sha256(canonical(schematic.tiles, 0, false));
    }

    static String normalized(Schematic schematic) {
        String minimum = null;
        for (int mirror = 0; mirror < 2; mirror++) {
            for (int quarterTurns = 0; quarterTurns < 4; quarterTurns++) {
                String form = canonical(schematic.tiles, quarterTurns, mirror == 1);
                if (minimum == null || form.compareTo(minimum) < 0) minimum = form;
            }
        }
        return sha256(minimum == null ? "[]" : minimum);
    }

    private static String canonical(Iterable<Schematic.Stile> tiles, int turns, boolean mirror) {
        List<String> entries = new ArrayList<>();
        int minX = Integer.MAX_VALUE, minY = Integer.MAX_VALUE;
        List<int[]> transformed = new ArrayList<>();
        List<Schematic.Stile> source = new ArrayList<>();
        for (Schematic.Stile tile : tiles) {
            int x = mirror ? -tile.x : tile.x;
            int y = tile.y;
            for (int i = 0; i < turns; i++) { int nextX = -y; y = x; x = nextX; }
            transformed.add(new int[] { x, y });
            source.add(tile);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
        }
        for (int i = 0; i < source.size(); i++) {
            Schematic.Stile tile = source.get(i);
            int[] point = transformed.get(i);
            int rotation = (mirror ? -(tile.rotation & 3) : tile.rotation & 3);
            rotation = Math.floorMod(rotation + turns, 4);
            String block = tile.block == null ? "unknown" : tile.block.name;
            String config = canonicalConfig(tile.config);
            entries.add("{\"block\":" + quote(block) + ",\"x\":" + (point[0] - minX)
                + ",\"y\":" + (point[1] - minY) + ",\"rotation\":" + rotation
                + ",\"config\":" + config + "}");
        }
        entries.sort(Comparator.naturalOrder());
        return "[" + String.join(",", entries) + "]";
    }

    private static String canonicalConfig(Object config) {
        if (config == null) return "null";
        try { return canonicalJson(new JsonReader().parse(new Json().toJson(config))); }
        catch (Throwable unsupported) { return quote(String.valueOf(config)); }
    }

    private static String canonicalJson(JsonValue value) {
        if (value == null || value.isNull()) return "null";
        if (value.isObject()) {
            List<JsonValue> fields = new ArrayList<>();
            for (JsonValue child = value.child; child != null; child = child.next) fields.add(child);
            fields.sort(Comparator.comparing(field -> field.name == null ? "" : field.name));
            List<String> encoded = new ArrayList<>();
            for (JsonValue field : fields) encoded.add(quote(field.name == null ? "" : field.name) + ":" + canonicalJson(field));
            return "{" + String.join(",", encoded) + "}";
        }
        if (value.isArray()) {
            List<String> encoded = new ArrayList<>();
            for (JsonValue child = value.child; child != null; child = child.next) encoded.add(canonicalJson(child));
            return "[" + String.join(",", encoded) + "]";
        }
        if (value.isString()) return quote(value.asString());
        if (value.isBoolean()) return Boolean.toString(value.asBoolean());
        if (value.isLong()) return Long.toString(value.asLong());
        if (value.isDouble()) {
            try { return new BigDecimal(value.asString()).stripTrailingZeros().toPlainString(); }
            catch (NumberFormatException ignored) { return value.asString(); }
        }
        return quote(value.asString());
    }

    private static String sha256(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception impossible) { throw new IllegalStateException(impossible); }
    }

    private static String quote(String value) {
        StringBuilder result = new StringBuilder("\"");
        for (char character : value.toCharArray()) {
            switch (character) {
                case '\\' -> result.append("\\\\");
                case '"' -> result.append("\\\"");
                case '\n' -> result.append("\\n");
                case '\r' -> result.append("\\r");
                case '\t' -> result.append("\\t");
                default -> result.append(character);
            }
        }
        return result.append('"').toString();
    }
}
