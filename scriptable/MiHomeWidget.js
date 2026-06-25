const client = importModule("MiHomeClient");

function addMetric(container, label, value) {
  const stack = container.addStack();
  stack.layoutVertically();
  const valueText = stack.addText(String(value));
  valueText.font = Font.boldSystemFont(22);
  valueText.textColor = Color.dynamic(
    new Color("#111111"),
    new Color("#f5f5f5"),
  );
  const labelText = stack.addText(label);
  labelText.font = Font.systemFont(11);
  labelText.textColor = Color.dynamic(
    new Color("#666666"),
    new Color("#a8a8a8"),
  );
  return stack;
}

function errorWidget(message) {
  const widget = new ListWidget();
  widget.backgroundColor = Color.dynamic(
    new Color("#fff5f5"),
    new Color("#2a1515"),
  );
  const title = widget.addText("Mi Home");
  title.font = Font.boldSystemFont(14);
  title.textColor = new Color("#d43c3c");
  widget.addSpacer(8);
  const text = widget.addText(message);
  text.font = Font.systemFont(11);
  text.textColor = Color.dynamic(
    new Color("#5e2222"),
    new Color("#ffb8b8"),
  );
  return widget;
}

async function createWidget() {
  try {
    const storedConfig = client.loadConfig();
    const limit = 200;
    const response = await client.stats(7, limit, storedConfig);
    const summary = client.summarizeStatsResponse(response);

    const widget = new ListWidget();
    widget.backgroundColor = Color.dynamic(
      new Color("#f7f7f7"),
      new Color("#171717"),
    );
    widget.setPadding(14, 14, 14, 14);
    widget.url = `scriptable:///run?scriptName=${
      encodeURIComponent(
        "MiHomeStats",
      )
    }`;

    const title = widget.addText("Feeder");
    title.font = Font.semiboldSystemFont(13);
    title.textColor = new Color("#ff6900");
    widget.addSpacer(10);

    if (config.widgetFamily === "small") {
      addMetric(widget, "portions today", summary.feedToday);
      widget.addSpacer();
      const grams = widget.addText(
        `${summary.feedToday * storedConfig.portionGrams}g`,
      );
      grams.font = Font.systemFont(12);
      grams.textColor = Color.dynamic(
        new Color("#666666"),
        new Color("#a8a8a8"),
      );
    } else {
      const row = widget.addStack();
      row.spacing = 24;
      addMetric(row, "today", summary.feedToday);
      addMetric(row, "yesterday", summary.feedYesterday);
      addMetric(row, "7 days", summary.feedWeek);
      widget.addSpacer();
      const month = widget.addText(
        `This month: ${summary.feedMonth} portions`,
      );
      month.font = Font.systemFont(12);
      month.textColor = Color.dynamic(
        new Color("#555555"),
        new Color("#b8b8b8"),
      );
    }

    if (response.result.length >= limit) {
      const warning = widget.addText("Result limit reached");
      warning.font = Font.systemFont(9);
      warning.textColor = new Color("#c77700");
    }
    widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
    return widget;
  } catch (error) {
    return errorWidget(String(error.message || error));
  }
}

const widget = await createWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else if (config.runsInApp) {
  await widget.presentMedium();
} else {
  Script.setShortcutOutput({
    ok: false,
    error: "Use MiHomeStats in Shortcuts; MiHomeWidget is for iOS widgets.",
  });
}
Script.complete();
