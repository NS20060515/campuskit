import android.content.res.AssetManager;

import java.io.File;

/**
 * 桌面验证入口：用文件系统模拟 Android assets，启动与 APK 内完全相同的
 * AssetServer 实现，打印端口后保持运行，供外部 HTTP 校验。
 *
 * 用法：java -cp out ServerTest <assetsDir>
 */
public class ServerTest {

    public static void main(String[] args) throws Exception {
        if (args.length < 1) {
            System.err.println("usage: ServerTest <assetsDir>");
            System.exit(2);
        }
        AssetManager am = new AssetManager(new File(args[0]));
        com.campushub.app.AssetServer server = new com.campushub.app.AssetServer(am, "app");
        server.start();
        System.out.println("PORT=" + server.getPort());
        System.out.flush();
        Thread.sleep(180000);
    }
}
