const REPOSITORY_BASE =
  "https://raw.githubusercontent.com/placeless/mihome-tools/main/scriptable";

const FILES = [
  "MiHomeCore.js",
  "MiHomeClient.js",
  "MiHomeSetup.js",
  "MiHomeFeed.js",
  "MiHomeStats.js",
  "MiHomeWidget.js",
];

async function confirmInstall() {
  const alert = new Alert();
  alert.title = "Install Mi Home scripts";
  alert.message =
    "This downloads the Scriptable client from placeless/mihome-tools. " +
    "Existing files with the same names will be replaced.";
  alert.addAction("Install or update");
  alert.addCancelAction("Cancel");
  return (await alert.presentAlert()) === 0;
}

async function download(name) {
  const request = new Request(`${REPOSITORY_BASE}/${name}`);
  request.timeoutInterval = 20;
  const content = await request.loadString();
  const status = request.response ? request.response.statusCode : 0;
  if (status !== 200 || !content.trim()) {
    throw new Error(`Could not download ${name} (HTTP ${status})`);
  }
  return content;
}

async function main() {
  if (!(await confirmInstall())) {
    return;
  }

  const downloaded = {};
  try {
    for (const name of FILES) {
      downloaded[name] = await download(name);
    }
  } catch (error) {
    const alert = new Alert();
    alert.title = "Download failed";
    alert.message = String(error.message || error);
    alert.addAction("OK");
    await alert.presentAlert();
    return;
  }

  const files = FileManager.iCloud();
  const directory = files.documentsDirectory();
  for (const name of FILES) {
    files.writeString(files.joinPath(directory, name), downloaded[name]);
  }

  const alert = new Alert();
  alert.title = "Installation complete";
  alert.message =
    "Run MiHomeSetup next. Credentials are stored in Keychain, not in " +
    "the downloaded script files. To add the widget, add a Scriptable " +
    "widget in iOS, edit it, then select MiHomeWidget under Script.";
  alert.addAction("OK");
  await alert.presentAlert();
}

await main();
Script.complete();
