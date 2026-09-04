'use client';

export function QuickCodeInstructions() {
  return (
    <div className="card p-6">
      <h2 className="text-xl font-bold mb-4">使用说明</h2>

      <div className="space-y-4 text-sm">
        <div>
          <h3 className="font-semibold mb-2">1. 保存快速码</h3>
          <p className="text-muted-foreground">
            生成或重置快速码后，请立即复制并保存到安全的地方。刷新页面后将无法再次查看快速码。
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">2. 在 Mindustry 中连接</h3>
          <p className="text-muted-foreground">
            打开 Mindustry 游戏，在多人游戏界面输入快速码即可连接到论坛服务器。
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">3. 快速码安全</h3>
          <p className="text-muted-foreground">
            快速码是私密的，不要分享给他人。如果怀疑快速码泄露，请立即重置。
          </p>
        </div>

        <div>
          <h3 className="font-semibold mb-2">4. 快速码有效期</h3>
          <p className="text-muted-foreground">
            快速码在重置前一直有效。重置后旧码立即失效，需要使用新码。
          </p>
        </div>
      </div>
    </div>
  );
}
