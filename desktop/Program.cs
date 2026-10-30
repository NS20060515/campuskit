/* 校园通 CampusKit · Windows 桌面版宿主
 *
 * 技术方案：WinForms 原生窗口 + WebView2（复用系统自带 Edge 内核，不必打包浏览器）
 * 本地网页通过 https://campuskit.local 虚拟主机映射加载 —— 属于「安全上下文」，
 * 因此「按当前位置推荐最近教室」所需的定位能力可以正常使用。
 *
 * 采用 CoreWebView2Controller 手动托管模式：可直接订阅 AcceleratorKeyPressed，
 * 自定义快捷键，且只依赖 Microsoft.Web.WebView2.Core.dll。
 *
 * 注意：本机 csc 只支持 C# 5，代码未使用字符串插值、?.、表达式成员等新语法。
 */
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

namespace CampusKit
{
    internal static class Program
    {
        internal const string AppTitle = "校园通";
        internal const string VirtualHost = "campuskit.local";
        internal static string InitialPage = "";

        /// <summary>
        /// 把友好名称映射成页内路由（哈希路由格式为 #/模块/子页）。
        /// 可用：tt(课表) / rooms(空闲教室) / act(社团活动) / lost(失物广场)
        ///       match(智能匹配) / qa(问答) / policy(政策指南) / contacts(通讯录)
        /// </summary>
        internal static string RouteFor(string page)
        {
            switch ((page ?? "").ToLowerInvariant())
            {
                case "rooms":
                case "classroom":
                case "empty": return "tt/rooms";
                case "act":
                case "activities": return "tt/act";
                case "match":
                case "ai": return "lost/match";
                case "lost": return "lost";
                case "policy":
                case "policies": return "qa/policy";
                case "contacts":
                case "phone": return "qa/contacts";
                case "qa": return "qa";
                case "tt":
                case "timetable":
                default: return "tt";
            }
        }

        private static Mutex instanceMutex;
        internal static EventWaitHandle ShowEvent;

        [STAThread]
        private static void Main(string[] args)
        {
            // 支持 --page=rooms / lost / qa ... 指定启动页面，便于为单个模块建快捷方式
            for (int i = 0; i < args.Length; i++)
            {
                string a = args[i];
                if (a != null && a.StartsWith("--page=", StringComparison.OrdinalIgnoreCase))
                {
                    Program.InitialPage = a.Substring(7).Trim().TrimStart('#', '/');
                }
            }

            bool createdNew;
            instanceMutex = new Mutex(true, "CampusKit.SingleInstance.Mutex", out createdNew);
            if (!createdNew)
            {
                try
                {
                    EventWaitHandle ev = EventWaitHandle.OpenExisting("CampusKit.ShowWindow.Event");
                    ev.Set();
                }
                catch (Exception) { }
                return;
            }

            ShowEvent = new EventWaitHandle(false, EventResetMode.AutoReset, "CampusKit.ShowWindow.Event");

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new MainForm());

            GC.KeepAlive(instanceMutex);
        }
    }

    internal sealed class MainForm : Form
    {
        /* WebView2 的 Controller.Bounds 使用物理像素；
           而在 125%/150% 等缩放比例下 WinForms 的 ClientSize 可能返回逻辑值，
           因此统一用 Win32 GetClientRect 取物理客户区尺寸，避免网页只占窗口一角。 */
        [StructLayout(LayoutKind.Sequential)]
        private struct RECT { public int Left, Top, Right, Bottom; }

        [DllImport("user32.dll")]
        private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hWnd);

        /// <summary>运行诊断日志，便于排查缩放/加载问题（%LOCALAPPDATA%\CampusKit\diag.log）</summary>
        private void Diag(string msg)
        {
            try
            {
                File.AppendAllText(Path.Combine(dataDir, "diag.log"),
                    DateTime.Now.ToString("HH:mm:ss.fff") + "  " + msg + "\r\n");
            }
            catch (Exception) { }
        }

        private uint WindowDpi()
        {
            try
            {
                if (IsHandleCreated)
                {
                    uint d = GetDpiForWindow(Handle);
                    if (d >= 72) return d;
                }
            }
            catch (Exception) { }
            return (uint)Math.Max(96, DeviceDpi);
        }

        private readonly string baseDir;
        private readonly string appDir;
        private readonly string dataDir;

        private CoreWebView2Controller controller;
        private CoreWebView2 core;
        private Label splash;
        private LanServer lan;
        private bool fullscreen;
        private bool browserFallback;
        private bool ready;
        private Rectangle restoreBounds;
        private FormBorderStyle restoreStyle;
        private Thread listener;
        private volatile bool closing;
        private bool sizeRestored;

        internal MainForm()
        {
            baseDir = AppDomain.CurrentDomain.BaseDirectory;
            appDir = Path.Combine(baseDir, "app");
            dataDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CampusKit");
            try { Directory.CreateDirectory(dataDir); }
            catch (Exception) { }

            Text = Program.AppTitle;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(1200, 812);
            MinimumSize = new Size(780, 560);
            BackColor = Color.FromArgb(245, 246, 251);
            KeyPreview = true;
            ApplyIcon();
            LoadWindowState();

            splash = new Label();
            splash.Dock = DockStyle.Fill;
            splash.TextAlign = ContentAlignment.MiddleCenter;
            splash.Text = "正在启动 " + Program.AppTitle + " …";
            splash.Font = new Font("Microsoft YaHei UI", 12F, FontStyle.Regular);
            splash.ForeColor = Color.FromArgb(104, 112, 138);
            Controls.Add(splash);

            Load += OnFormLoad;
            FormClosing += OnFormClosing;
            Resize += OnResize;
            DpiChanged += delegate { SyncBounds(); };
            KeyDown += OnFormKeyDown;
        }

        private void ApplyIcon()
        {
            try
            {
                string ico = Path.Combine(baseDir, "app.ico");
                if (File.Exists(ico)) Icon = new Icon(ico);
            }
            catch (Exception) { }
        }

        /* ---------------- 启动 ---------------- */

        private void OnFormLoad(object sender, EventArgs e)
        {
            ApplyDpiScale();

            if (!File.Exists(Path.Combine(appDir, "index.html")))
            {
                MessageBox.Show(
                    "未找到程序文件目录：\n" + appDir +
                    "\n\n请确认 app 子文件夹与主程序在同一目录下。",
                    Program.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
                return;
            }

            string version = null;
            try { version = CoreWebView2Environment.GetAvailableBrowserVersionString(); }
            catch (Exception) { version = null; }

            if (string.IsNullOrEmpty(version))
            {
                FallbackToBrowser(null, "本机未安装 WebView2 运行时（Edge 内核）。");
                return;
            }

            StartShowListener();
            InitWebViewAsync();
        }

        /// <summary>
        /// 进程已通过清单声明 PerMonitorV2，WinForms 坐标即物理像素。
        /// 高分屏下按当前 DPI 放大默认窗口与最小尺寸，避免窗口显得过小。
        /// </summary>
        private void ApplyDpiScale()
        {
            try
            {
                uint dpi = WindowDpi();
                float s = dpi / 96f;
                if (s < 1.01f) s = 1f;
                if (!sizeRestored)
                {
                    int w = (int)Math.Round(1200 * s);
                    int h = (int)Math.Round(812 * s);
                    Rectangle wa = Screen.FromControl(this).WorkingArea;
                    if (w > wa.Width - 40) w = wa.Width - 40;
                    if (h > wa.Height - 40) h = wa.Height - 40;
                    ClientSize = new Size(w, h);
                    Location = new Point(
                        wa.Left + (wa.Width - Width) / 2,
                        wa.Top + Math.Max(0, (wa.Height - Height) / 2));
                }
                MinimumSize = new Size((int)Math.Round(720 * s), (int)Math.Round(520 * s));
                SyncBounds();
                Diag("ApplyDpiScale 窗口DPI=" + dpi + " 缩放=" + s.ToString("0.00") +
                     " DeviceDpi=" + DeviceDpi + " ClientSize=" + ClientSize.Width + "x" + ClientSize.Height +
                     " PhysicalClient=" + PhysicalClient().Width + "x" + PhysicalClient().Height +
                     " sizeRestored=" + sizeRestored);
            }
            catch (Exception ex) { Diag("ApplyDpiScale 异常: " + ex.Message); }
        }

        private async void InitWebViewAsync()
        {
            try
            {
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(
                    null, Path.Combine(dataDir, "WebView2"), null);

                controller = await env.CreateCoreWebView2ControllerAsync(Handle);
                controller.Bounds = PhysicalClient();
                controller.DefaultBackgroundColor = Color.FromArgb(245, 246, 251);
                controller.IsVisible = false;          // 导航完成后再显示，避免白屏闪一下
                controller.AcceleratorKeyPressed += OnAcceleratorKey;
                try { controller.ShouldDetectMonitorScaleChanges = true; }
                catch (Exception) { }

                core = controller.CoreWebView2;
                ConfigureCore(core);
                string url = "https://" + Program.VirtualHost + "/index.html";
                if (Program.InitialPage.Length > 0)
                    url = url + "#/" + Program.RouteFor(Program.InitialPage);
                core.Navigate(url);
            }
            catch (Exception ex)
            {
                FallbackToBrowser(ex, "内置浏览器内核初始化失败。");
            }
        }

        private void ConfigureCore(CoreWebView2 c)
        {
            CoreWebView2Settings s = c.Settings;
            s.AreDefaultContextMenusEnabled = false;      // 原生应用观感；F12 仍可打开调试器
            s.AreDevToolsEnabled = true;
            s.AreBrowserAcceleratorKeysEnabled = false;   // Ctrl+P / Ctrl+T 等交给宿主
            s.IsStatusBarEnabled = false;
            s.IsZoomControlEnabled = true;
            s.IsPasswordAutosaveEnabled = false;
            s.IsGeneralAutofillEnabled = false;
            s.IsSwipeNavigationEnabled = false;

            c.SetVirtualHostNameToFolderMapping(
                Program.VirtualHost, appDir, CoreWebView2HostResourceAccessKind.Allow);

            c.PermissionRequested += OnPermissionRequested;
            c.NewWindowRequested += OnNewWindowRequested;
            c.NavigationStarting += OnNavigationStarting;
            c.DocumentTitleChanged += OnDocumentTitleChanged;
            c.NavigationCompleted += OnNavigationCompleted;
            c.ProcessFailed += OnProcessFailed;
            c.WebMessageReceived += OnWebMessageReceived;
        }

        /// <summary>
        /// 网页侧点「手机访问」时，按需启动内网共享服务并回传局域网地址。
        /// 采用按需启动：不在应用启动时就暴露端口，也避免一开程序就弹防火墙授权。
        /// </summary>
        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string msg = null;
            try { msg = e.TryGetWebMessageAsString(); }
            catch (Exception) { }
            if (msg != "share") return;

            string url = "";
            bool ok = false;
            try
            {
                if (lan == null) lan = new LanServer(appDir);
                ok = lan.Running || lan.Start();
                if (ok) url = lan.Url;
                Diag("手机访问：内网服务 ok=" + ok + " url=" + url);
            }
            catch (Exception ex)
            {
                Diag("手机访问失败：" + ex.Message);
            }

            string payload = "{\"type\":\"share\",\"ok\":" + (ok ? "true" : "false") +
                             ",\"url\":\"" + (url == null ? "" : url) + "\"}";
            try { core.PostWebMessageAsString(payload); }
            catch (Exception) { }
        }

        /* ---------------- 内核事件 ---------------- */

        private void OnPermissionRequested(object sender, CoreWebView2PermissionRequestedEventArgs e)
        {
            // 只放行定位（用于「按当前位置推荐最近教室」），其余一律拒绝
            e.State = e.PermissionKind == CoreWebView2PermissionKind.Geolocation
                ? CoreWebView2PermissionState.Allow
                : CoreWebView2PermissionState.Deny;
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;                 // 外部链接交给系统浏览器，不在应用内开新窗口
            OpenExternal(e.Uri);
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            string uri = e.Uri == null ? "" : e.Uri.ToLowerInvariant();
            if (uri.StartsWith("tel:") || uri.StartsWith("mailto:"))
            {
                e.Cancel = true;
                OpenExternal(e.Uri);
            }
        }

        private void OnDocumentTitleChanged(object sender, object e)
        {
            try
            {
                string t = core.DocumentTitle;
                if (string.IsNullOrEmpty(t)) t = Program.AppTitle;
                else if (t.IndexOf(Program.AppTitle) < 0) t = t + " · " + Program.AppTitle;
                Text = t;
            }
            catch (Exception) { }
        }

        private void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            if (!e.IsSuccess)
            {
                ShowLoadError(e.WebErrorStatus.ToString());
                return;
            }
            ready = true;
            if (splash != null) splash.Visible = false;
            if (controller != null)
            {
                controller.Bounds = PhysicalClient();
                controller.IsVisible = true;
            }
            ActiveControl = null;
        }

        private void ShowLoadError(string status)
        {
            ready = true;
            if (splash != null) splash.Visible = false;
            if (controller == null) return;
            try
            {
                core.NavigateToString(
                    "<!doctype html><html lang='zh-CN'><head><meta charset='utf-8'></head>" +
                    "<body style=\"margin:0;font-family:'Microsoft YaHei UI',sans-serif;background:#f5f6fb;color:#161a2b\">" +
                    "<div style='max-width:560px;margin:80px auto;padding:28px;background:#fff;border:1px solid #e7eaf3;border-radius:16px'>" +
                    "<h2 style='margin:0 0 8px'>页面加载失败</h2>" +
                    "<p style='color:#68708a;margin:0 0 6px'>错误信息：" + status + "</p>" +
                    "<p style='color:#68708a;margin:0'>请确认 app 文件夹完整，然后按 F5 重试。</p>" +
                    "</div></body></html>");
                controller.IsVisible = true;
            }
            catch (Exception) { }
        }

        private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            if (closing) return;
            MessageBox.Show(
                "浏览器内核进程异常退出（" + e.ProcessFailedKind.ToString() + "）。\n请重新启动校园通。",
                Program.AppTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        }

        /* ---------------- 快捷键 ---------------- */

        private void OnAcceleratorKey(object sender, CoreWebView2AcceleratorKeyPressedEventArgs e)
        {
            if (e.KeyEventKind != CoreWebView2KeyEventKind.KeyDown &&
                e.KeyEventKind != CoreWebView2KeyEventKind.SystemKeyDown) return;

            uint vk = e.VirtualKey;
            bool ctrl = (Control.ModifierKeys & Keys.Control) == Keys.Control;
            bool shift = (Control.ModifierKeys & Keys.Shift) == Keys.Shift;

            switch (vk)
            {
                case 0x74:                                  // F5
                    if (core != null) core.Reload();
                    e.Handled = true;
                    break;
                case 0x7A:                                  // F11
                    ToggleFullscreen();
                    e.Handled = true;
                    break;
                case 0x7B:                                  // F12
                    ToggleDevTools();
                    e.Handled = true;
                    break;
                case 0x1B:                                  // Esc 退出全屏
                    if (fullscreen) { ToggleFullscreen(); e.Handled = true; }
                    break;
                case 0x30:                                  // Ctrl+0
                case 0x31:                                  // Ctrl+1
                    if (ctrl) { SetZoom(1.0); e.Handled = true; }
                    break;
                case 0xBB:                                  // Ctrl+=
                case 0x6B:                                  // Ctrl+小键盘 +
                    if (ctrl) { SetZoom(Zoom() + 0.1); e.Handled = true; }
                    break;
                case 0xBD:                                  // Ctrl+-
                case 0x6D:                                  // Ctrl+小键盘 -
                    if (ctrl) { SetZoom(Zoom() - 0.1); e.Handled = true; }
                    break;
                case 0x49:                                  // Ctrl+Shift+I
                    if (ctrl && shift) { ToggleDevTools(); e.Handled = true; }
                    break;
                default:
                    break;
            }
        }

        private void OnFormKeyDown(object sender, KeyEventArgs e)
        {
            // 焦点在宿主窗口（而非网页）时的兜底
            if (e.KeyCode == Keys.F11) { ToggleFullscreen(); e.Handled = true; }
            else if (e.KeyCode == Keys.F12) { ToggleDevTools(); e.Handled = true; }
            else if (e.KeyCode == Keys.F5) { if (core != null) core.Reload(); e.Handled = true; }
        }

        private double Zoom()
        {
            try { return controller == null ? 1.0 : controller.ZoomFactor; }
            catch (Exception) { return 1.0; }
        }

        private void SetZoom(double v)
        {
            if (controller == null) return;
            if (v < 0.5) v = 0.5;
            if (v > 2.0) v = 2.0;
            try { controller.ZoomFactor = v; }
            catch (Exception) { }
        }

        private void ToggleDevTools()
        {
            try { if (core != null) core.OpenDevToolsWindow(); }
            catch (Exception) { }
        }

        private void ToggleFullscreen()
        {
            if (!fullscreen)
            {
                restoreBounds = Bounds;
                restoreStyle = FormBorderStyle;
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Normal;
                Bounds = Screen.FromControl(this).Bounds;
                fullscreen = true;
            }
            else
            {
                FormBorderStyle = restoreStyle;
                Bounds = restoreBounds;
                fullscreen = false;
            }
            SyncBounds();
        }

        /* ---------------- 尺寸同步 ---------------- */

        /// <summary>物理像素的客户区尺寸（WebView2 需要物理像素）</summary>
        private Rectangle PhysicalClient()
        {
            try
            {
                RECT r;
                if (IsHandleCreated && GetClientRect(Handle, out r))
                {
                    int w = r.Right - r.Left, h = r.Bottom - r.Top;
                    if (w > 0 && h > 0) return new Rectangle(0, 0, w, h);
                }
            }
            catch (Exception) { }
            return new Rectangle(0, 0, ClientSize.Width, ClientSize.Height);
        }

        private void OnResize(object sender, EventArgs e)
        {
            SyncBounds();
            if (!ready && splash != null && controller == null) splash.Visible = true;
        }

        private void SyncBounds()
        {
            if (controller == null) return;
            try { controller.Bounds = PhysicalClient(); }
            catch (Exception) { }
        }

        /* ---------------- 单实例唤起 ---------------- */

        private void StartShowListener()
        {
            listener = new Thread(new ThreadStart(delegate
            {
                while (!closing)
                {
                    try
                    {
                        if (Program.ShowEvent.WaitOne(400))
                        {
                            BeginInvoke(new MethodInvoker(BringToFrontWindow));
                        }
                    }
                    catch (Exception) { }
                }
            }));
            listener.IsBackground = true;
            listener.Start();
        }

        private void BringToFrontWindow()
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Normal;
            Show();
            Activate();
            TopMost = true;
            TopMost = false;
        }

        /* ---------------- 退出与窗口状态 ---------------- */

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            closing = true;
            SaveWindowState();
            try { if (lan != null) lan.Stop(); }
            catch (Exception) { }
            try { if (controller != null) controller.Close(); }
            catch (Exception) { }
        }

        private void LoadWindowState()
        {
            try
            {
                string f = Path.Combine(dataDir, "ui.txt");
                if (!File.Exists(f)) return;
                string[] p = File.ReadAllText(f).Split(',');
                if (p.Length < 5) return;
                int l = int.Parse(p[0]), t = int.Parse(p[1]);
                int w = int.Parse(p[2]), h = int.Parse(p[3]);
                bool max = p[4].Trim() == "1";
                if (w < 500 || h < 400) return;
                Rectangle r = new Rectangle(l, t, w, h);
                bool visible = false;
                Screen[] screens = Screen.AllScreens;
                for (int i = 0; i < screens.Length; i++)
                {
                    if (screens[i].WorkingArea.IntersectsWith(r)) { visible = true; break; }
                }
                if (!visible) return;
                StartPosition = FormStartPosition.Manual;
                Bounds = r;
                sizeRestored = true;
                if (max) WindowState = FormWindowState.Maximized;
            }
            catch (Exception) { }
        }

        private void SaveWindowState()
        {
            try
            {
                Rectangle r = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                string s = r.Left + "," + r.Top + "," + r.Width + "," + r.Height + "," +
                           (WindowState == FormWindowState.Maximized ? "1" : "0");
                File.WriteAllText(Path.Combine(dataDir, "ui.txt"), s);
            }
            catch (Exception) { }
        }

        /* ---------------- 回退方案 ---------------- */

        private void FallbackToBrowser(Exception ex, string reason)
        {
            if (browserFallback) return;
            browserFallback = true;
            string index = Path.Combine(appDir, "index.html");
            string msg = reason + "\n";
            if (ex != null && !string.IsNullOrEmpty(ex.Message))
                msg = msg + "\n详细信息：" + ex.Message + "\n";
            msg = msg + "\n是否改用系统默认浏览器打开？\n（功能相同，但「设备定位」不可用）";
            DialogResult r = MessageBox.Show(msg, Program.AppTitle,
                MessageBoxButtons.YesNo, MessageBoxIcon.Warning);
            if (r == DialogResult.Yes && File.Exists(index)) OpenExternal(index);
            Close();
        }

        private static void OpenExternal(string target)
        {
            if (string.IsNullOrEmpty(target)) return;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(target);
                psi.UseShellExecute = true;
                Process.Start(psi);
            }
            catch (Exception) { }
        }
    }
}
