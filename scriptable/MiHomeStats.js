const client = importModule("MiHomeClient");
const runContext = config;

function requestOptions() {
  let days = 7;
  let limit = 200;
  const parameter = args.shortcutParameter;
  if (parameter && typeof parameter === "object") {
    days = Number(parameter.days ?? days);
    limit = Number(parameter.limit ?? limit);
  } else if (parameter !== null && parameter !== undefined) {
    const suppliedDays = Number(parameter);
    if (Number.isInteger(suppliedDays)) {
      days = suppliedDays;
    }
  }
  if (args.queryParameters) {
    days = Number(args.queryParameters.days ?? days);
    limit = Number(args.queryParameters.limit ?? limit);
  }
  return { days, limit };
}

function dailyDetails(summary, portionGrams) {
  const lines = [];
  for (const day of Object.keys(summary.daily).reverse()) {
    const portions = summary.daily[day];
    lines.push(`${day}: ${portions} portion(s), ${portions * portionGrams}g`);
  }
  return lines.length > 0 ? lines.join("\n") : "No feed events found.";
}

async function showSummary(summary, config, truncated) {
  const alert = new Alert();
  alert.title = "Mi Home feeder";
  alert.message = [
    `Today: ${summary.feedToday} (${summary.feedToday * config.portionGrams}g)`,
    `Yesterday: ${summary.feedYesterday} (${
      summary.feedYesterday * config.portionGrams
    }g)`,
    `Last 7 days: ${summary.feedWeek}`,
    `This month: ${summary.feedMonth}`,
    truncated ? "\nResult limit reached; history may be truncated." : "",
  ]
    .filter(Boolean)
    .join("\n");
  alert.addAction("Daily details");
  alert.addCancelAction("Done");
  if ((await alert.presentAlert()) === 0) {
    await QuickLook.present(dailyDetails(summary, config.portionGrams));
  }
}

async function main() {
  const interactive = client.isInteractiveContext(runContext);
  try {
    const appConfig = client.loadConfig();
    const { days, limit } = requestOptions();
    const response = await client.stats(days, limit, appConfig);
    const summary = client.summarizeStatsResponse(response);
    const result = {
      ok: true,
      days,
      limit,
      truncated: response.result.length >= limit,
      summary,
    };
    if (interactive) {
      await showSummary(summary, appConfig, result.truncated);
    }
    return result;
  } catch (error) {
    const message = String(error.message || error);
    if (interactive) {
      const alert = new Alert();
      alert.title = "Stats failed";
      alert.message = message;
      alert.addAction("OK");
      await alert.presentAlert();
    }
    return { ok: false, error: message };
  }
}

const output = await main();
Script.setShortcutOutput(output);
Script.complete();
