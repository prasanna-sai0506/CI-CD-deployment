const REFRESH_SECONDS = 30;
const STORAGE_OWNER_KEY = 'git_owner';
const STORAGE_REPOS_KEY = 'git_repos';
const STORAGE_SINGLE_REPO_KEY = 'git_repo';

let githubOwner = localStorage.getItem(STORAGE_OWNER_KEY) || '';
let githubRepos = loadRepositoryList();
let countdown = REFRESH_SECONDS;
let refreshIntervalId = null;

const ownerInput = document.getElementById('owner-input');
const repoInput = document.getElementById('repo-input');
const saveBtn = document.getElementById('save-config-btn');
const tableBody = document.getElementById('runs-table-body');
const statusBanner = document.getElementById('status-banner');
const statusBannerIcon = document.getElementById('status-banner-icon');
const statusBannerText = document.getElementById('status-banner-text');
const deployedShaEl = document.getElementById('deployed-sha');
const refreshStatusEl = document.getElementById('refresh-status');
const manualRefreshBtn = document.getElementById('manual-refresh-btn');

document.addEventListener('DOMContentLoaded', () => {
  ownerInput.value = githubOwner;
  repoInput.value = githubRepos.join(', ');

  fetchDeployedVersion();

  if (hasRepositoryConfig()) {
    fetchWorkflowRuns();
    startCountdown();
  } else {
    showNoConfigState();
    resetCountdown();
  }
});

saveBtn.addEventListener('click', () => {
  const newOwner = ownerInput.value.trim();
  const newRepos = parseRepositoryList(repoInput.value);

  if (!newOwner || newRepos.length === 0) {
    alert('Please enter a GitHub Owner and at least one Repository name.');
    return;
  }

  githubOwner = newOwner;
  githubRepos = newRepos;
  localStorage.setItem(STORAGE_OWNER_KEY, githubOwner);
  localStorage.setItem(STORAGE_REPOS_KEY, JSON.stringify(githubRepos));
  localStorage.setItem(STORAGE_SINGLE_REPO_KEY, githubRepos[0]);

  fetchWorkflowRuns();
  resetCountdown();
  startCountdown();
});

manualRefreshBtn.addEventListener('click', () => {
  if (hasRepositoryConfig()) {
    fetchWorkflowRuns();
    resetCountdown();
  }
});

function loadRepositoryList() {
  const storedRepos = localStorage.getItem(STORAGE_REPOS_KEY);

  if (storedRepos) {
    try {
      const parsedRepos = JSON.parse(storedRepos);
      if (Array.isArray(parsedRepos)) {
        const cleanedRepos = parsedRepos.map(repo => String(repo).trim()).filter(Boolean);
        if (cleanedRepos.length > 0) {
          return cleanedRepos;
        }
      }
    } catch {
      // Fall back to the legacy single-repo storage key.
    }
  }

  const legacyRepo = localStorage.getItem(STORAGE_SINGLE_REPO_KEY) || '';
  return legacyRepo.trim() ? [legacyRepo.trim()] : [];
}

function parseRepositoryList(rawValue) {
  return Array.from(new Set(
    rawValue
      .split(/[\n,]/)
      .map(repo => repo.trim())
      .filter(Boolean)
  ));
}

function hasRepositoryConfig() {
  return Boolean(githubOwner && githubRepos.length > 0);
}

function fetchDeployedVersion() {
  fetch('/api/version')
    .then(res => res.json())
    .then(data => {
      if (data.version && data.version !== 'development') {
        deployedShaEl.textContent = data.version.substring(0, 7);
        deployedShaEl.title = data.version;
      } else {
        deployedShaEl.textContent = 'local-dev';
      }
    })
    .catch(() => {
      deployedShaEl.textContent = 'unknown';
    });
}

function fetchWorkflowRuns() {
  if (!hasRepositoryConfig()) return;

  setLoadingState();

  const requests = githubRepos.map(repo => fetchRepositoryRuns(githubOwner, repo));

  Promise.allSettled(requests)
    .then(results => {
      const successfulResults = results
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value);
      const failedResults = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason && result.reason.message ? result.reason.message : 'Unknown repository error');

      const combinedRuns = successfulResults
        .flatMap(result => result.runs)
        .sort((left, right) => new Date(right.created_at) - new Date(left.created_at));

      renderTable(combinedRuns);
      updateStatusBanner(combinedRuns, failedResults);
    })
    .catch(error => {
      showErrorState(error.message);
    });
}

function fetchRepositoryRuns(owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=15`;

  return fetch(url)
    .then(res => {
      if (!res.ok) {
        throw new Error(`GitHub API error for ${repo}: ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then(data => ({
      repo,
      runs: (data.workflow_runs || []).map(run => ({
        ...run,
        repo
      }))
    }));
}

function renderTable(runs) {
  if (runs.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          No workflow runs found for the selected repositories.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = runs.map(run => {
    const runNumber = escapeHtml(String(run.run_number));
    const trigger = escapeHtml(run.event || 'unknown');
    const branch = escapeHtml(run.head_branch || 'unknown');
    const commitMsg = run.head_commit ? run.head_commit.message : 'N/A';
    const escapedCommitMsg = escapeHtml(commitMsg);
    const truncatedMsg = commitMsg.length > 40 ? `${escapeHtml(commitMsg.substring(0, 37))}...` : escapedCommitMsg;
    const statusInfo = getRunStatus(run);
    const duration = calculateDuration(run.run_started_at, run.updated_at);
    const timestamp = new Date(run.created_at).toLocaleString();
    const logsUrl = escapeHtml(run.html_url || '#');
    const repoLabel = escapeHtml(run.repo || 'repo');

    return `
      <tr>
        <td><span class="badge neutral">${repoLabel}</span></td>
        <td class="mono">#${runNumber}</td>
        <td><span class="badge neutral">${trigger}</span></td>
        <td class="mono">${branch}</td>
        <td title="${escapedCommitMsg}">${truncatedMsg}</td>
        <td><span class="badge ${statusInfo.statusClass}">${escapeHtml(statusInfo.statusLabel)}</span></td>
        <td>${duration}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${timestamp}</td>
        <td><a href="${logsUrl}" class="link-btn" target="_blank" rel="noreferrer">View Logs ↗</a></td>
      </tr>
    `;
  }).join('');
}

function getRunStatus(run) {
  let statusClass = 'neutral';
  let statusLabel = run.status;

  if (run.status === 'completed') {
    if (run.conclusion === 'success') {
      statusClass = 'success';
      statusLabel = 'success';
    } else if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'cancelled') {
      statusClass = 'failure';
      statusLabel = run.conclusion;
    }
  } else if (run.status === 'in_progress' || run.status === 'queued') {
    statusClass = 'in-progress';
    statusLabel = 'in progress';
  }

  return { statusClass, statusLabel };
}

function updateStatusBanner(runs, failures) {
  if (runs.length === 0) {
    if (failures.length > 0) {
      statusBanner.className = 'status-banner failure';
      statusBannerIcon.textContent = '🔴';
      statusBannerText.textContent = failures[0];
      return;
    }

    statusBanner.className = 'status-banner unknown';
    statusBannerIcon.textContent = '⚪';
    statusBannerText.textContent = 'No workflows have run yet';
    return;
  }

  const latestRun = runs[0];
  const repoLabel = latestRun.repo ? latestRun.repo : 'selected repository';

  if (failures.length > 0) {
    statusBanner.className = 'status-banner unknown';
    statusBannerIcon.textContent = '🟡';
    statusBannerText.textContent = `Loaded ${githubRepos.length} repositories with ${failures.length} error${failures.length === 1 ? '' : 's'} while fetching statuses.`;
    return;
  }

  if (latestRun.status === 'completed') {
    if (latestRun.conclusion === 'success') {
      statusBanner.className = 'status-banner success';
      statusBannerIcon.textContent = '🟢';
      statusBannerText.textContent = `All systems operational - Last pipeline run succeeded in ${repoLabel}`;
    } else {
      statusBanner.className = 'status-banner failure';
      statusBannerIcon.textContent = '🔴';
      statusBannerText.textContent = `Deployment Alert - Last pipeline build failed in ${repoLabel}`;
    }
  } else {
    statusBanner.className = 'status-banner unknown';
    statusBannerIcon.textContent = '🟡';
    statusBannerText.textContent = `Active deployment in progress - Latest pipeline run is active in ${repoLabel}`;
  }
}

function calculateDuration(startStr, endStr) {
  if (!startStr || !endStr) return 'N/A';

  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end - start;

  if (Number.isNaN(diffMs) || diffMs < 0) return '0s';

  const totalSecs = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }

  return `${secs}s`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showNoConfigState() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
        Please enter a GitHub Owner and at least one Repository name to load pipeline metrics.
      </td>
    </tr>
  `;
  statusBanner.className = 'status-banner unknown';
  statusBannerIcon.textContent = '⚪';
  statusBannerText.textContent = 'Waiting for repository configuration';
}

function showErrorState(message) {
  tableBody.innerHTML = `
    <tr>
      <td colspan="9" style="text-align: center; color: var(--color-failure); padding: 2rem;">
        Error loading pipeline: ${escapeHtml(message)}. Make sure the repository is public and credentials are correct.
      </td>
    </tr>
  `;
  statusBanner.className = 'status-banner failure';
  statusBannerIcon.textContent = '🔴';
  statusBannerText.textContent = `Pipeline Error: ${message}`;
}

function setLoadingState() {
  statusBanner.className = 'status-banner unknown';
  statusBannerIcon.textContent = '🟡';
  statusBannerText.textContent = `Loading pipeline status for ${githubRepos.length} ${githubRepos.length === 1 ? 'repository' : 'repositories'}...`;
}

function startCountdown() {
  if (refreshIntervalId) clearInterval(refreshIntervalId);

  refreshIntervalId = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      fetchWorkflowRuns();
      resetCountdown();
    } else {
      refreshStatusEl.textContent = `Refreshing in ${countdown}s`;
    }
  }, 1000);
}

function resetCountdown() {
  countdown = REFRESH_SECONDS;
  refreshStatusEl.textContent = `Refreshing in ${REFRESH_SECONDS}s`;
}
