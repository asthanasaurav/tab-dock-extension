// Maps hostnames to stable app ids used for grouping and pinning.
const APP_RULES = [
  { id: "gmail", label: "Gmail", hosts: ["mail.google.com"], color: "#ea4335", openUrl: "https://mail.google.com" },
  { id: "calendar", label: "Calendar", hosts: ["calendar.google.com"], color: "#4285f4", openUrl: "https://calendar.google.com" },
  { id: "docs", label: "Docs", hosts: ["docs.google.com"], color: "#4285f4", openUrl: "https://docs.google.com" },
  { id: "sheets", label: "Sheets", hosts: ["sheets.google.com"], color: "#34a853", openUrl: "https://sheets.google.com" },
  { id: "drive", label: "Drive", hosts: ["drive.google.com"], color: "#fbbc04", openUrl: "https://drive.google.com" },
  { id: "forms", label: "Forms", hosts: ["forms.google.com"], color: "#9334e6", openUrl: "https://forms.google.com" },
  { id: "slides", label: "Slides", hosts: ["slides.google.com"], color: "#fbbc04", openUrl: "https://slides.google.com" },
  { id: "meet", label: "Meet", hosts: ["meet.google.com"], color: "#00897b", openUrl: "https://meet.google.com" },
  { id: "chat", label: "Chat", hosts: ["chat.google.com"], color: "#34a853", openUrl: "https://chat.google.com" },
  { id: "github", label: "GitHub", hosts: ["github.com"], color: "#24292f", openUrl: "https://github.com" },
  { id: "slack", label: "Slack", hosts: ["slack.com", "app.slack.com"], color: "#4a154b", openUrl: "https://slack.com" },
  { id: "notion", label: "Notion", hosts: ["notion.so", "www.notion.so"], color: "#000000", openUrl: "https://notion.so" },
];

const HOST_TO_APP = new Map();
for (const app of APP_RULES) {
  for (const host of app.hosts) {
    HOST_TO_APP.set(host, app);
  }
}

function resolveAppFromUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (HOST_TO_APP.has(host)) {
      return HOST_TO_APP.get(host);
    }
    return {
      id: host,
      label: prettifyHost(host),
      hosts: [host],
      color: "#5f6368",
      openUrl: `https://${host}`,
    };
  } catch {
    return {
      id: "unknown",
      label: "Other",
      hosts: [],
      color: "#5f6368",
      openUrl: null,
    };
  }
}

function prettifyHost(host) {
  const base = host.replace(/^www\./, "");
  const parts = base.split(".");
  if (parts.length >= 2) {
    return parts[parts.length - 2].charAt(0).toUpperCase() + parts[parts.length - 2].slice(1);
  }
  return base;
}

function getAppById(appId) {
  return APP_RULES.find((app) => app.id === appId) ?? null;
}
