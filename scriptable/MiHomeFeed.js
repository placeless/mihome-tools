const client = importModule("MiHomeClient");
const core = importModule("MiHomeCore");

function requestedPortions() {
  const candidates = [
    args.shortcutParameter,
    args.queryParameters ? args.queryParameters.portions : null,
    args.widgetParameter,
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate === "object" && candidate.portions) {
      return Number(candidate.portions);
    }
    const number = Number(candidate);
    if (Number.isInteger(number) && number > 0) {
      return number;
    }
  }
  return null;
}

async function choosePortions(config) {
  const requested = requestedPortions();
  if (requested !== null) {
    return requested;
  }

  const menu = new Alert();
  menu.title = "Feed";
  menu.message = "Choose the number of portions.";
  for (let portions = 1; portions <= config.maxPortions; portions += 1) {
    menu.addAction(`${portions} portion${portions === 1 ? "" : "s"}`);
  }
  menu.addCancelAction("Cancel");
  const choice = await menu.presentSheet();
  return choice < 0 ? null : choice + 1;
}

async function confirmFeed(portions, config) {
  const grams = portions * config.portionGrams;
  const alert = new Alert();
  alert.title = "Confirm feeding";
  alert.message = `Dispense ${portions} portion${
    portions === 1 ? "" : "s"
  } (${grams}g)?`;
  alert.addAction("Feed now");
  alert.addCancelAction("Cancel");
  return (await alert.presentAlert()) === 0;
}

async function showResult(title, message) {
  const alert = new Alert();
  alert.title = title;
  alert.message = message;
  alert.addAction("OK");
  await alert.presentAlert();
}

async function main() {
  try {
    const config = client.loadConfig();
    const portions = await choosePortions(config);
    if (portions === null) {
      return { ok: false, cancelled: true };
    }
    if (!(await confirmFeed(portions, config))) {
      return { ok: false, cancelled: true };
    }

    const response = await client.feed(portions, config);
    const ok = core.isOkFeedResponse(response);
    const result = { ok, portions, response };
    if (ok) {
      await showResult(
        "Feeding complete",
        `Dispensed ${portions} portion${portions === 1 ? "" : "s"}.`,
      );
    } else {
      await showResult(
        "Feeding failed",
        response && response.message
          ? String(response.message)
          : JSON.stringify(response),
      );
    }
    return result;
  } catch (error) {
    const message = String(error.message || error);
    await showResult("Feeding failed", message);
    return { ok: false, error: message };
  }
}

const output = await main();
Script.setShortcutOutput(output);
Script.complete();
