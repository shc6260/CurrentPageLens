// Only configures the panel. No automatic page collection or AI in workers.
const configure = () => chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: true}).catch(() => {});
chrome.runtime.onInstalled.addListener(configure);
chrome.runtime.onStartup.addListener(configure);
configure();
