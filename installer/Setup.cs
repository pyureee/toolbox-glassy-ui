using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Setup
{
    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            if (args.Length == 1 && args[0] == "--verify-payload")
            {
                string stage = Extract();
                try { ValidatePayload(stage); Console.WriteLine("Installer payload verified."); }
                finally { Cleanup(stage); }
                return 0;
            }
            if (args.Length == 2 && (args[0] == "--test-install" || args[0] == "--test-restore"))
            {
                string stage = Extract();
                try
                {
                    ValidateToolbox(args[1]);
                    var result = RunOperation(stage, args[1], args[0] == "--test-restore").GetAwaiter().GetResult();
                    Console.WriteLine(result.Item2);
                    return result.Item1;
                }
                finally { Cleanup(stage); }
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (var form = new SetupForm())
            {
                for (int i = 0; i < args.Length; i++)
                {
                    if (args[i] == "--folder" && i + 1 < args.Length) form.Folder = args[++i];
                    else if (args[i] == "--restore") form.Restore = true;
                    else if (args[i] == "--start") form.StartWhenShown = true;
                    else if (args[i] == "--preview" && i + 1 < args.Length)
                    {
                        form.PreviewMode = true;
                        form.StartPosition = FormStartPosition.Manual;
                        form.Location = new Point(-32000, -32000);
                        form.ShowInTaskbar = false;
                        form.Show(); Application.DoEvents();
                        using (var bitmap = new Bitmap(form.Width, form.Height))
                        { form.DrawToBitmap(bitmap, new Rectangle(0, 0, form.Width, form.Height)); bitmap.Save(args[++i]); }
                        return 0;
                    }
                }
                Application.Run(form);
            }
            return 0;
        }
        catch (Exception error) { Console.Error.WriteLine(error.Message); return 1; }
    }
    internal static string Quote(string value)
    {
        var text = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { text.Append('\\', slashes * 2 + 1); text.Append(c); }
            else { text.Append('\\', slashes); text.Append(c); }
            slashes = 0;
        }
        text.Append('\\', slashes * 2); text.Append('"'); return text.ToString();
    }
    internal static void ValidateToolbox(string root)
    {
        foreach (string name in new[] { "bin\\loader-gui.js", "bin\\gui\\main.html", "node_modules\\electron\\dist\\electron.exe" })
            if (!File.Exists(Path.Combine(root, name))) throw new IOException("Select the TERA Toolbox main folder, not its bin or mods folder.");
    }
    internal static string Extract()
    {
        string stage = Path.Combine(Path.GetTempPath(), "toolbox-custom-ui-setup-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(stage);
        try
        {
            using (Stream payload = Assembly.GetExecutingAssembly().GetManifestResourceStream("package.zip"))
            using (var archive = new ZipArchive(payload, ZipArchiveMode.Read))
                foreach (var entry in archive.Entries)
                {
                    string target = Path.GetFullPath(Path.Combine(stage, entry.FullName));
                    if (!target.StartsWith(stage + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) throw new IOException("Invalid installer package path.");
                    if (entry.Name.Length == 0) { Directory.CreateDirectory(target); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(target));
                    using (var input = entry.Open())
                    using (var output = File.Create(target)) input.CopyTo(output);
                }
            ValidatePayload(stage); return stage;
        }
        catch { Cleanup(stage); throw; }
    }
    internal static void ValidatePayload(string stage)
    {
        foreach (string name in new[] { "Install.ps1", "Restore.ps1", "scripts\\Common.ps1", "src\\installer.cjs", "src\\runtime\\custom-ui-updater.js" })
            if (!File.Exists(Path.Combine(stage, name))) throw new IOException("The installer package is incomplete.");
    }
    internal static void Cleanup(string stage)
    {
        string full = Path.GetFullPath(stage), temp = Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar);
        if (Path.GetDirectoryName(full).Equals(temp, StringComparison.OrdinalIgnoreCase) && Path.GetFileName(full).StartsWith("toolbox-custom-ui-setup-", StringComparison.Ordinal) && Directory.Exists(full))
            Directory.Delete(full, true);
    }
    internal static async Task<Tuple<int, string>> RunOperation(string stage, string folder, bool restore)
    {
        string script = Path.Combine(stage, restore ? "Restore.ps1" : "Install.ps1");
        var start = new ProcessStartInfo(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "WindowsPowerShell\\v1.0\\powershell.exe"));
        start.Arguments = "-NoProfile -ExecutionPolicy Bypass -File " + Quote(script) + " -ToolboxPath " + Quote(folder);
        start.UseShellExecute = false; start.CreateNoWindow = true;
        start.RedirectStandardOutput = true; start.RedirectStandardError = true;
        using (var process = Process.Start(start))
        {
            var stdout = process.StandardOutput.ReadToEndAsync();
            var stderr = process.StandardError.ReadToEndAsync();
            await Task.Run(() => process.WaitForExit());
            return Tuple.Create(process.ExitCode, (await stdout) + (await stderr));
        }
    }
}

internal sealed class SetupForm : Form
{
    private readonly TextBox folder = new TextBox();
    private readonly TextBox output = new TextBox();
    private readonly ComboBox operation = new ComboBox();
    private readonly Button install = new Button();
    private readonly Button browse = new Button();
    private readonly ProgressBar progress = new ProgressBar();
    private bool running;
    internal bool StartWhenShown;
    internal bool PreviewMode;
    protected override bool ShowWithoutActivation { get { return PreviewMode; } }
    internal string Folder { get { return folder.Text; } set { folder.Text = value; } }
    internal bool Restore { get { return operation.SelectedIndex == 1; } set { operation.SelectedIndex = value ? 1 : 0; } }
    internal SetupForm()
    {
        Text = "Toolbox Custom UI Setup"; ClientSize = new Size(660, 470);
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen; Font = new Font("Segoe UI", 10);
        BackColor = Color.FromArgb(44, 48, 55); ForeColor = Color.FromArgb(244, 246, 249);
        var title = new Label { Text = "Toolbox Custom UI", Font = new Font("Segoe UI", 20, FontStyle.Bold), Location = new Point(24, 22), AutoSize = true };
        var subtitle = new Label { Text = "Install the glass interface, or restore your previous UI.", Location = new Point(26, 69), AutoSize = true };
        var folderLabel = new Label { Text = "Where is your TERA Toolbox installed?", Location = new Point(26, 113), AutoSize = true };
        folder.SetBounds(26, 140, 493, 28);
        string defaultRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "TeraToolbox Private");
        folder.Text = Directory.Exists(defaultRoot) ? defaultRoot : "";
        browse.Text = "Browse..."; browse.SetBounds(528, 138, 105, 31);
        browse.Click += delegate
        {
            using (var picker = new FolderBrowserDialog { Description = "Select your TERA Toolbox main folder.", ShowNewFolderButton = false, SelectedPath = folder.Text })
                if (picker.ShowDialog(this) == DialogResult.OK) folder.Text = picker.SelectedPath;
        };
        var hint = new Label { Text = "Close Toolbox completely before continuing. Your mods and settings are kept.", Location = new Point(26, 181), Size = new Size(608, 35) };
        operation.DropDownStyle = ComboBoxStyle.DropDownList;
        operation.Items.AddRange(new object[] { "Install / update custom UI", "Restore previous UI" }); operation.SelectedIndex = 0;
        operation.SetBounds(26, 221, 320, 30);
        output.Multiline = true; output.ReadOnly = true; output.ScrollBars = ScrollBars.Vertical;
        output.SetBounds(26, 266, 608, 120); output.BackColor = Color.FromArgb(32, 37, 44); output.ForeColor = ForeColor;
        output.Text = "Select the main Toolbox folder, then click Continue.\r\nThe installer creates a backup before changing files.";
        progress.SetBounds(26, 400, 420, 12); progress.Visible = false;
        install.Text = "Continue"; install.SetBounds(462, 413, 172, 34);
        install.Click += async delegate { await Apply(); };
        Controls.AddRange(new Control[] { title, subtitle, folderLabel, folder, browse, hint, operation, output, progress, install });
        FormClosing += (sender, e) => { if (running) e.Cancel = true; };
        Shown += async delegate { if (StartWhenShown) await Apply(); };
    }
    private async Task Apply()
    {
        if (running) return;
        string stage = null;
        try
        {
            string root = Path.GetFullPath(folder.Text.Trim().Trim('"'));
            Setup.ValidateToolbox(root);
            // Elevate only when this installation folder is not writable.
            string probe = Path.Combine(root, ".custom-ui-writecheck-" + Guid.NewGuid().ToString("N"));
            try { using (File.Create(probe)) { } File.Delete(probe); }
            catch (UnauthorizedAccessException)
            {
                var elevated = new ProcessStartInfo(Application.ExecutablePath, "--folder " + Setup.Quote(root) + (Restore ? " --restore" : "") + " --start");
                elevated.UseShellExecute = true; elevated.Verb = "runas";
                Process.Start(elevated); Close(); return;
            }
            running = true; install.Enabled = browse.Enabled = folder.Enabled = operation.Enabled = false;
            progress.Style = ProgressBarStyle.Marquee; progress.Visible = true;
            output.Text = Restore ? "Restoring your previous UI..." : "Installing the custom UI...";
            stage = Setup.Extract();
            var result = await Setup.RunOperation(stage, root, Restore);
            output.Text = result.Item2;
            if (result.Item1 != 0) throw new IOException("The operation stopped. See the details above.");
            output.AppendText("\r\nDone. You can now reopen TERA Toolbox.");
        }
        catch (Exception error) { output.AppendText("\r\n" + error.Message); }
        finally
        {
            if (stage != null) { try { Setup.Cleanup(stage); } catch (Exception error) { output.AppendText("\r\nTemporary package cleanup: " + error.Message); } }
            running = false; install.Enabled = browse.Enabled = folder.Enabled = operation.Enabled = true; progress.Visible = false;
        }
    }
}
