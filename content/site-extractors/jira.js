(() => {
  globalThis.CPA_JIRA = {
    identify(doc) {
      const issuePath = /\/browse\/[A-Z][A-Z0-9_]*-\d+/i.test(location.pathname);
      const jiraMarker = doc.querySelector('meta[name="application-name"][content*="Jira"], [data-testid*="issue.views.issue-base"]');
      if (!issuePath && !jiraMarker) return null;
      // Optional landmarks only. No site-specific analysis or network calls.
      const find = selectors => selectors.map(s => doc.querySelector(s)).find(Boolean);
      return {
        title: find(['[data-testid="issue.views.issue-base.foundation.summary.heading"]', '#summary-val']),
        description: find(['[data-testid="issue.views.field.rich-text.description"]', '#description-val']),
        comments: [...doc.querySelectorAll('[data-testid="issue-comment-base"], [data-testid="issue.views.issue-base.activity.comment"], .issue-data-block.activity-comment')],
        attachments: [...doc.querySelectorAll('[data-testid*="attachment"] img, #attachment_thumbnails img')]
      };
    }
  };
})();
