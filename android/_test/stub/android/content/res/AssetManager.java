package android.content.res;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;

/**
 * 仅用于桌面验证的 AssetManager 桩：把 assets 目录映射到文件系统。
 * 目的是在不开模拟器的前提下，真实验证 AssetServer 的请求解析、
 * 路径映射、MIME 判定与 404 行为。
 */
public class AssetManager {

    private final File base;

    public AssetManager(File base) {
        this.base = base;
    }

    public InputStream open(String path) throws IOException {
        File f = new File(base, path);
        if (!f.isFile()) {
            throw new FileNotFoundException(path);
        }
        return new FileInputStream(f);
    }
}
