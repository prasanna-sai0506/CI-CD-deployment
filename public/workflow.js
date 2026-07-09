// Configuration and state management
let workflowOwner = localStorage.getItem('git_owner') || '';
let workflowRepo = localStorage.getItem('git_repo') || '';
let countdown = 30;
let refreshIntervalId = null;

// DOM Elements
const ownerInput = document.getElementById('workflow-owner-input');
const repoInput = document.getElementById('workflow-repo-input');
const saveBtn = document.getElementById('workflow-save-config-btn');
const tableBody = document.getElementById('workflow-runs-table-body');
const statusBanner = document.getElementById('workflow-status-banner');
const statusBannerIcon = document.getElementById('workflow-status-banner-icon');
const statusBannerText = document.getElementById('workflow-status-banner-text');
const deployedShaEl = document.getElementById('workflow-deployed-sha');
const refreshStatusEl = document.getElementById('workflow-refresh-status');
const manualRefreshBtn = document.getElementById('workflow-manual-refresh-btn');

document.addEventListener('DOMContentLoaded', () => {
  ownerInput.value = workflowOwner;
  repoInput.value = workflowRepo;

  fetchDeployedVersion();

  if (workflowOwner && workflowRepo) {
    fetchWorkflowRuns();
    startCountdown();
  } else {
    showNoConfigState();
  }
});

saveBtn.addEventListener('click', () => {
  const newOwner = ownerInput.value.trim();
  const newRepo = repoInput.value.trim();

  if (!newOwner || !newRepo) {
    alert('Please enter both GitHub Owner and Repository name.');
    return;
  }

  workflowOwner = newOwner;
  workflowRepo = newRepo;
  localStorage.setItem('git_owner', workflowOwner);
  localStorage.setItem('git_repo', workflowRepo);

  fetchWorkflowRuns();
  resetCountdown();
  startCountdown();
});

manualRefreshBtn.addEventListener('click', () => {
  if (workflowOwner && workflowRepo) {
    fetchWorkflowRuns();
    resetCountdown();
  }
});

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
  if (!workflowOwner || !workflowRepo) return;

  const url = `https://api.github.com/repos/${workflowOwner}/${workflowRepo}/actions/runs?per_page=15`;

  fetch(url)
    .then(res => {
      if (!res.ok) {
        throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
      }
      return res.json();
    })
    .then(data => {
      renderTable(data.workflow_runs || []);
      updateStatusBanner(data.workflow_runs || []);
    })
    .catch(err => {
      showErrorState(err.message);
    });
}

function renderTable(runs) {
  if (runs.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
          No workflow runs found for this repository.
        </td>
      </tr>
    `;
    return;
  }

  tableBody.innerHTML = runs.map(run => {
    const runNumber = run.run_number;
    const trigger = run.event;
    const branch = run.head_branch;
    const commitMsg = run.head_commit ? run.head_commit.message : 'N/A';
    const truncatedMsg = commitMsg.length > 40 ? commitMsg.substring(0, 37) + '...' : commitMsg;

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

    const duration = calculateDuration(run.run_started_at, run.updated_at);
    const timestamp = new Date(run.created_at).toLocaleString();
    const logsUrl = run.html_url;

    return `
      <tr>
        <td class="mono">#${runNumber}</td>
        <td><span class="badge neutral">${trigger}</span></td>
        <td class="mono">${branch}</td>
        <td title="${commitMsg}">${truncatedMsg}</td>
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
        <td>${duration}</td>
        <td style="font-size: 0.8rem; color: var(--text-secondary);">${timestamp}</td>
        <td><a href="${logsUrl}" class="link-btn" target="_blank">View Logs ↗</a></td>
      </tr>
    `;
  }).join('');
}

function updateStatusBanner(runs) {
  if (runs.length === 0) {
    statusBanner.className = 'status-banner unknown';
    statusBannerIcon.textContent = '⚪';
    statusBannerText.textContent = 'No workflows have run yet';
    return;
  }

  const latestRun = runs[0];

  if (latestRun.status === 'completed') {
    if (latestRun.conclusion === 'success') {
      statusBanner.className = 'status-banner success';
      statusBannerIcon.textContent = '🟢';
      statusBannerText.textContent = 'All systems operational - Last pipeline run succeeded';
    } else {
      statusBanner.className = 'status-banner failure';
      statusBannerIcon.textContent = '🔴';
      statusBannerText.textContent = 'Deployment Alert - Last pipeline build failed';
    }
  } else {
    statusBanner.className = 'status-banner unknown';
    statusBannerIcon.textContent = '🟡';
    statusBannerText.textContent = 'Active deployment in progress - Pipeline execution active';
  }
}

function calculateDuration(startStr, endStr) {
  if (!startStr || !endStr) return 'N/A';

  const start = new Date(startStr);
  const end = new Date(endStr);
  const diffMs = end - start;

  if (isNaN(diffMs) || diffMs < 0) return '0s';

  const totalSecs = Math.floor(diffMs / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;

  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

function showNoConfigState() {
  tableBody.innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">
        Please enter the GitHub Owner and Repository name to load pipeline metrics.
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
      <td colspan="8" style="text-align: center; color: var(--color-failure); padding: 2rem;">
        Error loading pipeline: ${message}. Make sure the repository is public and credentials are correct.
      </td>
    </tr>
  `;
  statusBanner.className = 'status-banner failure';
  statusBannerIcon.textContent = '🔴';
  statusBannerText.textContent = `Pipeline Error: ${message}`;
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
  countdown = 30;
  refreshStatusEl.textContent = 'Refreshing in 30s';
}