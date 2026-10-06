package cn.mdtbbs.renderer;

import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import arc.ApplicationListener;
import arc.Core;
import arc.backend.headless.HeadlessApplication;
import arc.files.Fi;
import arc.struct.Seq;
import arc.struct.StringMap;
import mindustry.Vars;
import mindustry.game.Schematic;
import mindustry.game.Schematics;

/** Regression coverage for destructive schematic editor operations. */
public final class EditorSafetyRegression {
    private EditorSafetyRegression() {}

    public static void main(String[] args) throws Exception {
        CountDownLatch completed = new CountDownLatch(1);
        AtomicReference<Throwable> failure = new AtomicReference<>();
        Path root = Files.createTempDirectory("mindfourm-editor-safety-");

        new HeadlessApplication(new ApplicationListener() {
            @Override public void init() {
                try {
                    MapRenderer.initializeForFixture(root);
                    verifyMultiblockEdits(root);
                } catch (Throwable error) {
                    failure.set(error);
                } finally {
                    Core.app.exit();
                    completed.countDown();
                }
            }
        }, error -> failure.compareAndSet(null, error));

        require(completed.await(60, TimeUnit.SECONDS), "editor safety regression timed out");
        if (failure.get() != null) throw new AssertionError("editor safety regression failed", failure.get());
        System.out.println("editor safety fixtures passed");
    }

    private static void verifyMultiblockEdits(Path root) throws Exception {
        var coreShard = Vars.content.block("core-shard");
        var router = Vars.content.block("router");
        require(coreShard != null && coreShard.size > 1, "core-shard must be a registered multiblock");
        require(router != null && router.size == 1, "router fixture must be registered");

        Schematic source = new Schematic(new Seq<>(), new StringMap(), 8, 8);
        source.tags.put("name", "Multiblock editor safety");
        source.tiles.add(new Schematic.Stile(coreShard, 2, 2, null, (byte)0));
        source.tiles.add(new Schematic.Stile(router, 6, 6, null, (byte)0));
        Path file = root.resolve("multiblock-editor-source.msch");
        Schematics.write(source, new Fi(file.toFile()));

        byte[] addedBytes = MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(), List.of(),
            List.of(new MapRenderer.AddedBlock(5, 2, "core-shard", 0)), List.of());
        Schematic added = Schematics.read(new ByteArrayInputStream(addedBytes));
        require(added.tiles.count(tile -> tile.block == coreShard) == 2,
            "the editor must serialize a valid added multiblock with its official block size");
        require(added.tiles.contains(tile -> tile.block == coreShard && tile.x == 5 && tile.y == 2),
            "the added multiblock anchor must round-trip through official .msch serialization");

        byte[] movedBytes = MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(),
            List.of(new MapRenderer.MovePosition(2, 2, 2, 5)), List.of(), List.of());
        Schematic moved = Schematics.read(new ByteArrayInputStream(movedBytes));
        require(moved.tiles.contains(tile -> tile.block == coreShard && tile.x == 2 && tile.y == 5),
            "a valid multiblock move must preserve the block and its new anchor");
        require(!moved.tiles.contains(tile -> tile.block == coreShard && tile.x == 2 && tile.y == 2),
            "a moved multiblock must not leave its old anchor behind");

        expectInvalid(() -> MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(),
            List.of(new MapRenderer.MovePosition(2, 2, 6, 6)), List.of(), List.of()),
            "moving a multiblock onto another building must fail closed");

        expectInvalid(() -> MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(),
            List.of(new MapRenderer.MovePosition(2, 2, 0, 4)), List.of(), List.of()),
            "moving a multiblock beyond the map boundary must fail closed");

        expectInvalid(() -> MapRenderer.transformSchematicBytes(
            file, 0, false, List.of(), List.of(),
            List.of(new MapRenderer.AddedBlock(0, 0, "core-shard", 0)), List.of()),
            "adding a multiblock beyond the schematic boundary must fail closed");
    }

    private static void expectInvalid(CheckedOperation operation, String message) throws Exception {
        try {
            operation.run();
            throw new AssertionError(message);
        } catch (MapRenderer.SchematicTransformException exception) {
            require("INVALID_SCHEMATIC_OPERATION".equals(exception.errorCode),
                message + ": expected INVALID_SCHEMATIC_OPERATION, got " + exception.errorCode);
        }
    }

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    @FunctionalInterface
    private interface CheckedOperation {
        void run() throws Exception;
    }
}
