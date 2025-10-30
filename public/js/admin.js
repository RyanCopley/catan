import { showSuccessToast, showErrorToast, showConfirmToast } from './modules/toast.js';

let socket;
let currentEditingGameId = null;
let metricsInterval = null;
let latencyInterval = null;
let latestSocketLatency = null;
let latestMetrics = null;
let latestMetricsHistory = null;
let metricsHistoryResizeTimeout = null;

const REQUEST_EVENT_COLORS = ['#f4511e', '#00838f', '#7cb342', '#8e24aa', '#ffb300', '#6d4c41'];
const TOTAL_REQUEST_COLOR = '#3949ab';
const SOCKET_TRAFFIC_COLORS = {
  inbound: '#26a69a',
  outbound: '#d81b60'
};

// Helper function to format relative time
function getRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const totalSeconds = Math.floor(diff / 1000);
  const totalMinutes = Math.floor(totalSeconds / 60);
  const totalHours = Math.floor(totalMinutes / 60);
  const totalDays = Math.floor(totalHours / 24);

  if (totalDays > 0) {
    const hours = totalHours % 24;
    const minutes = totalMinutes % 60;
    return `${totalDays}d${hours}h${minutes}m`;
  } else if (totalHours > 0) {
    const minutes = totalMinutes % 60;
    const seconds = totalSeconds % 60;
    return `${totalHours}h${minutes}m${seconds}s`;
  } else if (totalMinutes > 0) {
    const seconds = totalSeconds % 60;
    return `${totalMinutes}m${seconds}s`;
  } else {
    return `${totalSeconds}s`;
  }
}

// Helper function to get activity class for color coding
function getActivityClass(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 10) {
    return 'last-active-recent'; // Green - active within 10 min
  } else if (minutes < 20) {
    return 'last-active-warning'; // Orange - 10-20 min inactive
  } else {
    return 'last-active-stale'; // Red - 20+ min inactive
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 'N/A';
  }

  const totalSeconds = Math.floor(seconds);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (parts.length === 0) {
    parts.push(`${remainingSeconds}s`);
  }

  return parts.join(' ');
}

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond < 0) {
    return 'Calculating...';
  }

  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatRequestsPerSecond(rate) {
  if (!Number.isFinite(rate) || rate < 0) {
    return 'Calculating...';
  }

  if (rate >= 100) {
    return `${rate.toFixed(0)} req/s`;
  }

  if (rate >= 10) {
    return `${rate.toFixed(1)} req/s`;
  }

  return `${rate.toFixed(2)} req/s`;
}

function formatLatencyValue(latency) {
  if (!Number.isFinite(latency) || latency < 0) {
    return '—';
  }

  return `${Math.round(latency)} ms`;
}

function formatHistoryTimestamp(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function getLatestValue(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const value = values[i];
    if (Number.isFinite(value)) {
      return Number(value);
    }
  }
  return null;
}

function renderLegendHtml(items) {
  return items
    .map(item => {
      const valueText = item.value != null && Number.isFinite(item.value)
        ? (item.formatter ? item.formatter(item.value) : item.value.toFixed(2))
        : '—';

      return `
        <div class="chart-legend-item">
          <span class="chart-legend-swatch" style="background: ${item.color};"></span>
          <span>${item.label}</span>
          <span class="chart-legend-value">${valueText}</span>
        </div>
      `;
    })
    .join('');
}

function drawLineChart(canvas, timestamps, seriesList, options = {}) {
  if (!canvas) {
    return false;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return false;
  }

  const cssWidth = canvas.clientWidth || canvas.parentElement?.clientWidth || 0;
  const cssHeight = canvas.clientHeight || canvas.parentElement?.clientHeight || 0;

  if (!cssWidth || !cssHeight || !timestamps.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return false;
  }

  const dpr = window.devicePixelRatio || 1;
  const width = Math.round(cssWidth * dpr);
  const height = Math.round(cssHeight * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  const numericValues = [];
  seriesList.forEach(series => {
    series.values.forEach(value => {
      if (Number.isFinite(value)) {
        numericValues.push(Number(value));
      }
    });
  });

  if (!numericValues.length) {
    return false;
  }

  const padding = {
    top: 16,
    right: 18,
    bottom: 32,
    left: 60
  };

  const plotWidth = cssWidth - padding.left - padding.right;
  const plotHeight = cssHeight - padding.top - padding.bottom;

  if (plotWidth <= 0 || plotHeight <= 0) {
    return false;
  }

  let min = options.minValue != null ? options.minValue : Math.min(...numericValues);
  let max = options.maxValue != null ? options.maxValue : Math.max(...numericValues);

  if (max <= min) {
    const adjustment = Math.abs(min) < 1 ? 1 : Math.abs(min) * 0.1;
    max = min + adjustment;
  }

  const valueFormatter = options.valueFormatter || (value => {
    if (Math.abs(value) >= 100) {
      return value.toFixed(0);
    }
    if (Math.abs(value) >= 10) {
      return value.toFixed(1);
    }
    return value.toFixed(2);
  });

  ctx.save();
  ctx.scale(dpr, dpr);

  // Grid lines
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(84, 110, 122, 0.22)';
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i += 1) {
    const y = padding.top + (plotHeight * i) / gridLines;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(cssWidth - padding.right, y);
    ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = 'rgba(55, 71, 79, 0.65)';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, cssHeight - padding.bottom);
  ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
  ctx.stroke();

  // Series lines
  seriesList.forEach(series => {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = series.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    let drawing = false;
    series.values.forEach((value, index) => {
      if (!Number.isFinite(value)) {
        drawing = false;
        return;
      }

      const ratio = timestamps.length > 1 ? index / (timestamps.length - 1) : 0;
      const x = padding.left + ratio * plotWidth;
      const normalized = (Number(value) - min) / (max - min);
      const y = padding.top + (1 - normalized) * plotHeight;

      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();
  });

  ctx.fillStyle = 'rgba(38, 50, 56, 0.78)';
  ctx.font = '12px "Segoe UI", Tahoma, sans-serif';

  // Y-axis labels
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yLabelOffset = 8;
  ctx.fillText(valueFormatter(max), padding.left - yLabelOffset, padding.top);
  ctx.fillText(valueFormatter((max + min) / 2), padding.left - yLabelOffset, padding.top + plotHeight / 2);
  ctx.fillText(valueFormatter(min), padding.left - yLabelOffset, padding.top + plotHeight);

  // X-axis labels
  ctx.textBaseline = 'top';
  const xLabelY = cssHeight - padding.bottom + 6;
  ctx.textAlign = 'left';
  ctx.fillText(formatHistoryTimestamp(timestamps[0]), padding.left, xLabelY);
  ctx.textAlign = 'right';
  ctx.fillText(formatHistoryTimestamp(timestamps[timestamps.length - 1]), cssWidth - padding.right, xLabelY);

  ctx.restore();

  return true;
}

function drawUtilizationChart(history) {
  const canvas = document.getElementById('utilizationChart');
  const legendEl = document.getElementById('utilizationLegend');
  if (!canvas || !legendEl) {
    return false;
  }

  const samples = history.samples || [];
  if (!samples.length) {
    legendEl.innerHTML = '';
    return false;
  }

  const timestamps = samples.map(sample => sample.timestamp);
  const cpuValues = samples.map(sample => (Number.isFinite(sample.cpuUsagePercent) ? Number(sample.cpuUsagePercent) : null));
  const systemMemoryValues = samples.map(sample => {
    if (!Number.isFinite(sample.systemMemoryUsedBytes) || !Number.isFinite(sample.totalSystemMemoryBytes) || sample.totalSystemMemoryBytes <= 0) {
      return null;
    }
    return (sample.systemMemoryUsedBytes / sample.totalSystemMemoryBytes) * 100;
  });
  const processMemoryValues = samples.map(sample => {
    if (!Number.isFinite(sample.processMemoryRssBytes) || !Number.isFinite(sample.totalSystemMemoryBytes) || sample.totalSystemMemoryBytes <= 0) {
      return null;
    }
    return (sample.processMemoryRssBytes / sample.totalSystemMemoryBytes) * 100;
  });

  const rendered = drawLineChart(
    canvas,
    timestamps,
    [
      { label: 'CPU Usage', color: '#3949ab', values: cpuValues },
      { label: 'System Memory', color: '#00897b', values: systemMemoryValues },
      { label: 'Process RSS', color: '#ef6c00', values: processMemoryValues }
    ],
    {
      minValue: 0,
      maxValue: 100,
      valueFormatter: value => `${value.toFixed(0)}%`
    }
  );

  if (!rendered) {
    legendEl.innerHTML = '';
    return false;
  }

  const latestProcessSample = (() => {
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      const sample = samples[i];
      if (Number.isFinite(sample.processMemoryRssBytes)) {
        return sample;
      }
    }
    return null;
  })();

  legendEl.innerHTML = renderLegendHtml([
    {
      label: 'CPU Usage',
      color: '#3949ab',
      value: getLatestValue(cpuValues),
      formatter: value => `${value.toFixed(1)}%`
    },
    {
      label: 'System Memory',
      color: '#00897b',
      value: getLatestValue(systemMemoryValues),
      formatter: value => `${value.toFixed(1)}%`
    },
    {
      label: 'Process RSS',
      color: '#ef6c00',
      value: getLatestValue(processMemoryValues),
      formatter: value => {
        const percentText = `${value.toFixed(1)}%`;
        if (latestProcessSample && Number.isFinite(latestProcessSample.processMemoryRssBytes)) {
          return `${percentText} · ${formatBytes(latestProcessSample.processMemoryRssBytes)}`;
        }
        return percentText;
      }
    }
  ]);

  return true;
}

function drawNetworkChart(history) {
  const canvas = document.getElementById('networkChart');
  const legendEl = document.getElementById('networkLegend');
  if (!canvas || !legendEl) {
    return false;
  }

  const samples = history.samples || [];
  if (!samples.length) {
    legendEl.innerHTML = '';
    return false;
  }

  const timestamps = samples.map(sample => sample.timestamp);
  const downloadValues = samples.map(sample => (Number.isFinite(sample.networkReceiveRateBytes) ? Number(sample.networkReceiveRateBytes) : null));
  const uploadValues = samples.map(sample => (Number.isFinite(sample.networkSendRateBytes) ? Number(sample.networkSendRateBytes) : null));

  const rendered = drawLineChart(
    canvas,
    timestamps,
    [
      { label: 'Download', color: '#1e88e5', values: downloadValues },
      { label: 'Upload', color: '#c2185b', values: uploadValues }
    ],
    {
      minValue: 0,
      valueFormatter: value => formatRate(value)
    }
  );

  if (!rendered) {
    legendEl.innerHTML = '';
    return false;
  }

  legendEl.innerHTML = renderLegendHtml([
    {
      label: 'Download',
      color: '#1e88e5',
      value: getLatestValue(downloadValues),
      formatter: value => formatRate(value)
    },
    {
      label: 'Upload',
      color: '#c2185b',
      value: getLatestValue(uploadValues),
      formatter: value => formatRate(value)
    }
  ]);

  return true;
}

function drawSocketTrafficChart(history) {
  const canvas = document.getElementById('socketTrafficChart');
  const legendEl = document.getElementById('socketTrafficLegend');
  if (!canvas || !legendEl) {
    return false;
  }

  const samples = history.samples || [];
  if (!samples.length) {
    legendEl.innerHTML = '';
    return false;
  }

  const timestamps = samples.map(sample => sample.timestamp);
  const inboundValues = samples.map(sample => {
    if (!Number.isFinite(sample.socketInboundRateBytes)) {
      return null;
    }
    return Number(sample.socketInboundRateBytes);
  });
  const outboundValues = samples.map(sample => {
    if (!Number.isFinite(sample.socketOutboundRateBytes)) {
      return null;
    }
    return Number(sample.socketOutboundRateBytes);
  });

  const rendered = drawLineChart(
    canvas,
    timestamps,
    [
      { label: 'Inbound', color: SOCKET_TRAFFIC_COLORS.inbound, values: inboundValues },
      { label: 'Outbound', color: SOCKET_TRAFFIC_COLORS.outbound, values: outboundValues }
    ],
    {
      minValue: 0,
      valueFormatter: value => formatRate(value)
    }
  );

  if (!rendered) {
    legendEl.innerHTML = '';
    return false;
  }

  legendEl.innerHTML = renderLegendHtml([
    {
      label: 'Inbound',
      color: SOCKET_TRAFFIC_COLORS.inbound,
      value: getLatestValue(inboundValues),
      formatter: value => formatRate(value)
    },
    {
      label: 'Outbound',
      color: SOCKET_TRAFFIC_COLORS.outbound,
      value: getLatestValue(outboundValues),
      formatter: value => formatRate(value)
    }
  ]);

  return true;
}

function drawRequestsChart(history) {
  const canvas = document.getElementById('requestsChart');
  const legendEl = document.getElementById('requestsLegend');
  if (!canvas || !legendEl) {
    return false;
  }

  const samples = history.samples || [];
  if (!samples.length) {
    legendEl.innerHTML = '';
    return false;
  }

  const timestamps = samples.map(sample => sample.timestamp);
  const totalValues = samples.map(sample => {
    if (sample.socketRequestTotalRate == null) {
      return null;
    }
    const numeric = Number(sample.socketRequestTotalRate);
    return Number.isFinite(numeric) ? numeric : null;
  });

  const latestSample = samples[samples.length - 1] || null;

  const eventPeakRates = new Map();
  const latestEventRates = new Map();

  samples.forEach(sample => {
    const perEvent = sample.socketRequestRatesByEvent;
    if (!perEvent) {
      return;
    }

    Object.entries(perEvent).forEach(([eventName, rawValue]) => {
      const numeric = Number(rawValue);
      if (!Number.isFinite(numeric)) {
        return;
      }

      const currentPeak = eventPeakRates.get(eventName) ?? 0;
      if (numeric > currentPeak) {
        eventPeakRates.set(eventName, numeric);
      } else if (!eventPeakRates.has(eventName)) {
        eventPeakRates.set(eventName, currentPeak);
      }

      if (sample === latestSample) {
        latestEventRates.set(eventName, numeric);
      }
    });
  });

  const activeEventNames = Array.from(latestEventRates.entries())
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);

  const peakEventNames = Array.from(eventPeakRates.entries())
    .filter(([, peak]) => peak > 0)
    .sort((a, b) => {
      if (b[1] !== a[1]) {
        return b[1] - a[1];
      }
      return a[0].localeCompare(b[0]);
    })
    .map(([name]) => name);

  const selectedEventNames = [];
  const seenEventNames = new Set();
  const addEventName = (eventName) => {
    if (!seenEventNames.has(eventName) && selectedEventNames.length < REQUEST_EVENT_COLORS.length) {
      seenEventNames.add(eventName);
      selectedEventNames.push(eventName);
    }
  };

  activeEventNames.forEach(addEventName);
  peakEventNames.forEach(addEventName);

  if (selectedEventNames.length < REQUEST_EVENT_COLORS.length && latestSample?.socketRequestRatesByEvent) {
    Object.keys(latestSample.socketRequestRatesByEvent)
      .sort()
      .forEach(addEventName);
  }

  const seriesList = [
    { label: 'Total Requests', color: TOTAL_REQUEST_COLOR, values: totalValues }
  ];

  const legendItems = [
    {
      label: 'Total Requests',
      color: TOTAL_REQUEST_COLOR,
      value: getLatestValue(totalValues),
      formatter: value => formatRequestsPerSecond(value)
    }
  ];

  selectedEventNames.forEach((eventName, index) => {
    const color = REQUEST_EVENT_COLORS[index % REQUEST_EVENT_COLORS.length];
    const values = samples.map(sample => {
      const perEvent = sample.socketRequestRatesByEvent;
      if (!perEvent || perEvent[eventName] == null) {
        return 0;
      }
      const numeric = Number(perEvent[eventName]);
      return Number.isFinite(numeric) ? numeric : 0;
    });

    seriesList.push({ label: eventName, color, values });
    legendItems.push({
      label: eventName,
      color,
      value: getLatestValue(values),
      formatter: value => formatRequestsPerSecond(value)
    });
  });

  const rendered = drawLineChart(
    canvas,
    timestamps,
    seriesList,
    {
      minValue: 0,
      valueFormatter: value => formatRequestsPerSecond(value)
    }
  );

  if (!rendered) {
    legendEl.innerHTML = '';
    return false;
  }

  legendEl.innerHTML = renderLegendHtml(legendItems);
  return true;
}

function renderMetricsHistory(history) {
  const rangeEl = document.getElementById('metricsHistoryRange');
  const utilizationCanvas = document.getElementById('utilizationChart');
  const utilizationEmpty = document.getElementById('utilizationChartEmpty');
  const networkCanvas = document.getElementById('networkChart');
  const networkEmpty = document.getElementById('networkChartEmpty');
  const socketTrafficCanvas = document.getElementById('socketTrafficChart');
  const socketTrafficEmpty = document.getElementById('socketTrafficChartEmpty');
  const requestsCanvas = document.getElementById('requestsChart');
  const requestsEmpty = document.getElementById('requestsChartEmpty');

  if (!history || !Array.isArray(history.samples) || history.samples.length === 0) {
    latestMetricsHistory = null;
    if (rangeEl) {
      rangeEl.textContent = 'Collecting metrics history...';
    }
    if (utilizationCanvas) {
      utilizationCanvas.style.display = 'none';
    }
    if (utilizationEmpty) {
      utilizationEmpty.style.display = 'flex';
    }
    if (networkCanvas) {
      networkCanvas.style.display = 'none';
    }
    if (networkEmpty) {
      networkEmpty.style.display = 'flex';
    }
    if (socketTrafficCanvas) {
      socketTrafficCanvas.style.display = 'none';
    }
    if (socketTrafficEmpty) {
      socketTrafficEmpty.style.display = 'flex';
      socketTrafficEmpty.textContent = 'Collecting socket traffic history...';
    }
    if (requestsCanvas) {
      requestsCanvas.style.display = 'none';
    }
    if (requestsEmpty) {
      requestsEmpty.style.display = 'flex';
    }
    const utilizationLegend = document.getElementById('utilizationLegend');
    const networkLegend = document.getElementById('networkLegend');
    const socketTrafficLegend = document.getElementById('socketTrafficLegend');
    const requestsLegend = document.getElementById('requestsLegend');
    if (utilizationLegend) {
      utilizationLegend.innerHTML = '';
    }
    if (networkLegend) {
      networkLegend.innerHTML = '';
    }
    if (socketTrafficLegend) {
      socketTrafficLegend.innerHTML = '';
    }
    if (requestsLegend) {
      requestsLegend.innerHTML = '';
    }
    return;
  }

  latestMetricsHistory = history;

  if (rangeEl) {
    const intervalSeconds = Number(history.intervalSeconds) || 1;
    const totalSeconds = Math.max(1, Math.round(history.samples.length * intervalSeconds));
    rangeEl.textContent = `Window: ${formatDuration(totalSeconds)} · ${intervalSeconds.toFixed(0)}s intervals`;
  }

  const hasUtilization = drawUtilizationChart(history);
  if (utilizationCanvas) {
    utilizationCanvas.style.display = hasUtilization ? 'block' : 'none';
  }
  if (utilizationEmpty) {
    utilizationEmpty.style.display = hasUtilization ? 'none' : 'flex';
    if (!hasUtilization) {
      utilizationEmpty.textContent = 'Collecting metrics history...';
    }
  }

  const hasNetwork = drawNetworkChart(history);
  if (networkCanvas) {
    networkCanvas.style.display = hasNetwork ? 'block' : 'none';
  }
  if (networkEmpty) {
    networkEmpty.style.display = hasNetwork ? 'none' : 'flex';
    if (!hasNetwork) {
      networkEmpty.textContent = 'Collecting network history...';
    }
  }

  const hasSocketTraffic = drawSocketTrafficChart(history);
  if (socketTrafficCanvas) {
    socketTrafficCanvas.style.display = hasSocketTraffic ? 'block' : 'none';
  }
  if (socketTrafficEmpty) {
    socketTrafficEmpty.style.display = hasSocketTraffic ? 'none' : 'flex';
    if (!hasSocketTraffic) {
      socketTrafficEmpty.textContent = 'Collecting socket traffic history...';
    }
  }

  const hasRequests = drawRequestsChart(history);
  if (requestsCanvas) {
    requestsCanvas.style.display = hasRequests ? 'block' : 'none';
  }
  if (requestsEmpty) {
    requestsEmpty.style.display = hasRequests ? 'none' : 'flex';
    if (!hasRequests) {
      requestsEmpty.textContent = 'Collecting request history...';
    }
  }
}

function scheduleMetricsHistoryRedraw() {
  if (!latestMetricsHistory) {
    return;
  }

  if (metricsHistoryResizeTimeout) {
    clearTimeout(metricsHistoryResizeTimeout);
  }

  metricsHistoryResizeTimeout = setTimeout(() => {
    metricsHistoryResizeTimeout = null;
    if (latestMetricsHistory) {
      drawUtilizationChart(latestMetricsHistory);
      drawNetworkChart(latestMetricsHistory);
      drawSocketTrafficChart(latestMetricsHistory);
      drawRequestsChart(latestMetricsHistory);
    }
  }, 150);
}

function renderNetworkMetrics() {
  const container = document.getElementById('networkMetrics');
  if (!container) {
    return;
  }

  const metrics = latestMetrics;
  const network = metrics?.network ?? null;
  const requests = metrics?.requests ?? null;
  const socketTraffic = metrics?.socketTraffic ?? null;

  const cards = [];

  if (network) {
    const receiveRateText = network.receiveRate != null ? formatRate(network.receiveRate) : 'Calculating...';
    const sendRateText = network.sendRate != null ? formatRate(network.sendRate) : 'Calculating...';
    const sampledAt = network.lastSampledAt ? new Date(network.lastSampledAt).toLocaleTimeString() : null;

    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Network Usage</div>
        <div class="metric-value">${receiveRateText} ↓</div>
        <div class="metric-subtext">
          Upload: ${sendRateText} ↑<br>
          Total Down: ${formatBytes(network.bytesReceived)} · Total Up: ${formatBytes(network.bytesSent)}${sampledAt ? `<br>Sampled ${sampledAt}` : ''}
        </div>
      </div>
    `);
  } else if (metrics) {
    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Network Usage</div>
        <div class="metric-value">—</div>
      <div class="metric-subtext">Network usage metrics unavailable on this system.</div>
      </div>
    `);
  }

  if (socketTraffic) {
    const inboundRateText = formatRate(socketTraffic.inboundRate);
    const outboundRateText = formatRate(socketTraffic.outboundRate);
    const sampledAt = socketTraffic.lastSampledAt ? new Date(socketTraffic.lastSampledAt).toLocaleTimeString() : null;

    const topInbound = Object.entries(socketTraffic.perEventInboundRates ?? {})
      .map(([name, value]) => {
        const numeric = Number(value);
        return [name, Number.isFinite(numeric) ? numeric : 0];
      })
      .filter(([, rate]) => rate > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const topOutbound = Object.entries(socketTraffic.perEventOutboundRates ?? {})
      .map(([name, value]) => {
        const numeric = Number(value);
        return [name, Number.isFinite(numeric) ? numeric : 0];
      })
      .filter(([, rate]) => rate > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const detailLines = [
      `Upload: ${outboundRateText} ↑`,
      `Total Down: ${formatBytes(socketTraffic.totalInboundBytes)} · Total Up: ${formatBytes(socketTraffic.totalOutboundBytes)}`
    ];

    if (topInbound.length) {
      detailLines.push(
        `Inbound: ${topInbound
          .map(([name, rate]) => `${name}: ${formatRate(rate)}`)
          .join(', ')}`
      );
    }

    if (topOutbound.length) {
      detailLines.push(
        `Outbound: ${topOutbound
          .map(([name, rate]) => `${name}: ${formatRate(rate)}`)
          .join(', ')}`
      );
    }

    if (!topInbound.length && !topOutbound.length) {
      detailLines.push('No socket traffic recorded in the last sample');
    }

    if (sampledAt) {
      detailLines.push(`Sampled ${sampledAt}`);
    }

    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Socket Traffic</div>
        <div class="metric-value">${inboundRateText} ↓</div>
        <div class="metric-subtext">
          ${detailLines.join('<br>')}
        </div>
      </div>
    `);
  } else if (metrics) {
    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Socket Traffic</div>
        <div class="metric-value">—</div>
        <div class="metric-subtext">Collecting socket traffic metrics...</div>
      </div>
    `);
  }

  if (requests) {
    const sampledAt = requests.lastSampledAt ? new Date(requests.lastSampledAt).toLocaleTimeString() : null;
    const totalRateText = formatRequestsPerSecond(requests.totalRate);
    const topEvents = Object.entries(requests.perEventRates ?? {})
      .map(([name, value]) => {
        const numeric = Number(value);
        return [name, Number.isFinite(numeric) ? numeric : 0];
      })
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    const eventsText = topEvents.length
      ? topEvents
          .map(([name, value]) => `${name}: ${formatRequestsPerSecond(value)}`)
          .join('<br>')
      : 'No events recorded in the last sample';

    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Socket Throughput</div>
        <div class="metric-value">${totalRateText}</div>
        <div class="metric-subtext">
          ${eventsText}${sampledAt ? `<br>Sampled ${sampledAt}` : ''}
        </div>
      </div>
    `);
  } else if (metrics) {
    cards.push(`
      <div class="metric-card">
        <div class="metric-title">Socket Throughput</div>
        <div class="metric-value">—</div>
        <div class="metric-subtext">Collecting socket request metrics...</div>
      </div>
    `);
  }

  const latencySubtitle = (() => {
    if (!socket || socket.disconnected) {
      return 'Socket disconnected';
    }
    if (latestSocketLatency == null) {
      return 'Measuring latency...';
    }
    return `Connected as ${socket.id} · Round trip to server`;
  })();

  cards.push(`
    <div class="metric-card">
      <div class="metric-title">WebSocket Latency</div>
      <div class="metric-value">${formatLatencyValue(latestSocketLatency)}</div>
    <div class="metric-subtext">${latencySubtitle}</div>
    </div>
  `);

  const statusMessages = [];
  if (!metrics) {
    statusMessages.push('Collecting network metrics...');
  }
  const statusMessage = statusMessages.length
    ? `<div class="network-empty">${statusMessages.join('<br>')}</div>`
    : '';

  container.innerHTML = `
    ${statusMessage}
    <div class="network-grid">
      ${cards.join('')}
    </div>
  `;
}

function startLatencyMonitoring() {
  if (!socket) {
    return;
  }

  if (latencyInterval) {
    clearInterval(latencyInterval);
  }

  measureSocketLatency();
  latencyInterval = setInterval(measureSocketLatency, 10000);
}

function stopLatencyMonitoring() {
  if (latencyInterval) {
    clearInterval(latencyInterval);
    latencyInterval = null;
  }
}

function measureSocketLatency() {
  if (!socket || socket.disconnected) {
    latestSocketLatency = null;
    renderNetworkMetrics();
    return;
  }

  latestSocketLatency = null;
  renderNetworkMetrics();

  const start = performance.now();
  let settled = false;

  const timeoutId = setTimeout(() => {
    if (settled) {
      return;
    }
    settled = true;
    latestSocketLatency = null;
    renderNetworkMetrics();
  }, 5000);

  socket.emit('admin:ping', () => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(timeoutId);
    latestSocketLatency = Math.round(performance.now() - start);
    renderNetworkMetrics();
  });
}

function startMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }

  fetchSystemMetrics();
  metricsInterval = setInterval(fetchSystemMetrics, 10000);
}

function stopMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
    metricsInterval = null;
  }
}

async function fetchSystemMetrics() {
  const statusEl = document.getElementById('metricsStatus');
  const errorEl = document.getElementById('metricsError');

  if (statusEl) {
    statusEl.textContent = 'Updating server metrics...';
  }

  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  try {
    const response = await fetch('/admin/system/metrics');

    if (response.status === 401) {
      stopMetricsPolling();
      showLoginScreen();
      return;
    }

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    renderSystemMetrics(data.metrics);
    renderMetricsHistory(data.history);

    if (statusEl) {
      const generatedAt = data.metrics?.generatedAt ? new Date(data.metrics.generatedAt) : new Date();
      const isValidDate = !Number.isNaN(generatedAt.getTime());
      const formattedTime = isValidDate ? generatedAt.toLocaleTimeString() : 'just now';
      const uptime = formatDuration(data.metrics?.uptimeSeconds ?? 0);
      statusEl.textContent = `Last updated ${formattedTime} · Uptime ${uptime}`;
    }
  } catch (error) {
    console.error('Failed to load system metrics:', error);
    if (statusEl) {
      statusEl.textContent = 'Unable to refresh server metrics';
    }
    if (errorEl) {
      errorEl.textContent = 'Unable to load server metrics. Please try again later.';
      errorEl.style.display = 'block';
    }
  }
}

function renderSystemMetrics(metrics) {
  const metricsContainer = document.getElementById('systemMetrics');
  const errorEl = document.getElementById('metricsError');

  if (!metricsContainer) {
    return;
  }

  latestMetrics = metrics;

  if (errorEl) {
    errorEl.textContent = '';
    errorEl.style.display = 'none';
  }

  const totalSystem = metrics?.memory?.totalSystem ?? 0;
  const usedSystem = metrics?.memory?.usedSystem ?? 0;
  const freeSystem = metrics?.memory?.freeSystem ?? 0;
  const systemUsagePercent = totalSystem ? Math.min((usedSystem / totalSystem) * 100, 100) : 0;
  const processRss = metrics?.processMemory?.rss ?? 0;
  const processHeapUsed = metrics?.processMemory?.heapUsed ?? 0;
  const processHeapTotal = metrics?.processMemory?.heapTotal ?? 0;
  const processExternal = metrics?.processMemory?.external ?? 0;
  const loadAverage = metrics?.cpu?.loadAverage ?? [];
  const loadOne = loadAverage[0] ?? 0;
  const loadFive = loadAverage[1] ?? 0;
  const loadFifteen = loadAverage[2] ?? 0;
  const cpuCores = metrics?.cpu?.coreCount ?? 0;
  const cpuModel = metrics?.cpu?.model ?? '';
  const uptimeSeconds = metrics?.uptimeSeconds ?? 0;
  const nodeVersion = metrics?.nodeVersion ?? 'unknown';
  const pid = metrics?.pid ?? '—';
  const platform = metrics?.platform ?? '';

  metricsContainer.innerHTML = `
    <div class="metric-card">
      <div class="metric-title">CPU Load</div>
      <div class="metric-value">${loadOne.toFixed(2)}</div>
      <div class="metric-subtext">
        5m: ${loadFive.toFixed(2)} · 15m: ${loadFifteen.toFixed(2)}<br>
        Cores: ${cpuCores}${cpuModel ? ` · ${cpuModel}` : ''}
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-title">System Memory</div>
      <div class="metric-value">${formatBytes(usedSystem)} / ${formatBytes(totalSystem)}</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${systemUsagePercent.toFixed(0)}%"></div>
      </div>
      <div class="metric-subtext">${systemUsagePercent.toFixed(1)}% used · ${formatBytes(freeSystem)} free</div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Process Memory (RSS)</div>
      <div class="metric-value">${formatBytes(processRss)}</div>
      <div class="metric-subtext">
        Heap: ${formatBytes(processHeapUsed)} / ${formatBytes(processHeapTotal)}<br>
        External: ${formatBytes(processExternal)}
      </div>
    </div>
    <div class="metric-card">
      <div class="metric-title">Runtime</div>
      <div class="metric-value">${formatDuration(uptimeSeconds)}</div>
      <div class="metric-subtext">Node ${nodeVersion} · PID ${pid}${platform ? ` · ${platform}` : ''}</div>
    </div>
  `;

  renderNetworkMetrics();
}

// Check authentication on load
async function checkAuth() {
  try {
    const response = await fetch('/admin/check-auth');
    const data = await response.json();

    if (data.isAuthenticated) {
      showAdminPanel();
      initializeSocket();
      refreshGames();
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showLoginScreen();
  }
}

function showLoginScreen() {
  stopMetricsPolling();
  stopLatencyMonitoring();
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  latestMetrics = null;
  latestSocketLatency = null;
  latestMetricsHistory = null;
  if (metricsHistoryResizeTimeout) {
    clearTimeout(metricsHistoryResizeTimeout);
    metricsHistoryResizeTimeout = null;
  }
  renderNetworkMetrics();
  renderMetricsHistory(null);
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
}

function showAdminPanel() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminPanel').style.display = 'block';
  startMetricsPolling();
  renderNetworkMetrics();
}

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('loginError');

  errorDiv.textContent = '';

  try {
    const response = await fetch('/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showAdminPanel();
      initializeSocket();
      refreshGames();
    } else {
      errorDiv.textContent = data.error || 'Login failed';
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.textContent = 'Network error. Please try again.';
  }
});

async function logout() {
  try {
    await fetch('/admin/logout', { method: 'POST' });
    showLoginScreen();
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
  } catch (error) {
    console.error('Logout error:', error);
  }
}

function initializeSocket() {
  if (socket) {
    socket.disconnect();
  }

  socket = io();

  socket.on('connect', () => {
    console.log('Admin socket connected');
    startLatencyMonitoring();
    renderNetworkMetrics();
  });

  socket.on('disconnect', () => {
    console.log('Admin socket disconnected');
    stopLatencyMonitoring();
    latestSocketLatency = null;
    renderNetworkMetrics();
  });
}

async function refreshGames() {
  try {
    const response = await fetch('/admin/games');
    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to fetch games:', data.error);
      return;
    }

    renderGames(data.games);
  } catch (error) {
    console.error('Error fetching games:', error);
  }
}

function renderGames(games) {
  const lobbies = games.filter(g => g.phase === 'waiting');
  const inProgress = games.filter(g => g.phase !== 'waiting');

  renderGameList('lobbiesContainer', lobbies);
  renderGameList('gamesContainer', inProgress);
}

function renderGameList(containerId, games) {
  const container = document.getElementById(containerId);

  if (games.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div>No games found</div>
      </div>
    `;
    return;
  }

  container.innerHTML = games.map(game => `
    <div class="game-card">
      <div class="game-card-header">
        <div class="game-id">${game.id}</div>
        <span class="game-phase phase-${game.phase}">${game.phase}</span>
      </div>
      <div class="game-info">
        <div><strong>Players:</strong> ${game.players.length}</div>
        ${game.players.length > 0 ? `
          <ul class="players-list">
            ${game.players.map(p => `
              <li>
                <span style="color: ${p.color}">●</span>
                ${p.name}
                ${game.phase !== 'waiting' ? `(${p.victoryPoints} VP)` : ''}
              </li>
            `).join('')}
          </ul>
        ` : ''}
        ${game.phase === 'playing' || game.phase === 'setup' ? `
          <div><strong>Turn:</strong> ${game.players[game.currentPlayerIndex]?.name || 'Unknown'}</div>
          <div><strong>Phase:</strong> ${game.turnPhase}</div>
        ` : ''}
        ${game.phase !== 'waiting' && game.lastActivityAt ? `
          <div><strong>Last active:</strong> <span class="last-active ${getActivityClass(game.lastActivityAt)}">${getRelativeTime(game.lastActivityAt)}</span></div>
        ` : ''}
      </div>
      <div class="game-actions">
        <button class="btn btn-secondary" onclick="spectateGame('${game.id}')">Spectate</button>
        ${game.phase !== 'waiting' ? `
          <button class="btn btn-secondary" onclick="editGameState('${game.id}')">Edit State</button>
        ` : ''}
        <button class="btn btn-danger" onclick="deleteGame('${game.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function spectateGame(gameId) {
  // Open the game in a new tab/window with spectate mode
  window.open(`/?spectate=${gameId}`, '_blank');
}

async function deleteGame(gameId) {
  const confirmed = await showConfirmToast(
    `Delete game ${gameId}? This cannot be undone.`,
    {
      confirmText: 'Delete',
      cancelText: 'Cancel',
      type: 'warning'
    }
  );

  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`/admin/games/${gameId}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Server handles notifying game clients
      refreshGames();
      showSuccessToast(`Game ${gameId} deleted`);
    } else {
      showErrorToast('Failed to delete game: ' + (data.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Error deleting game:', error);
    showErrorToast('Network error while deleting game');
  }
}

async function editGameState(gameId) {
  try {
    const response = await fetch(`/admin/games/${gameId}`);
    const data = await response.json();

    if (!response.ok) {
      showErrorToast('Failed to load game state: ' + (data.error || 'Unknown error'));
      return;
    }

    currentEditingGameId = gameId;
    document.getElementById('stateEditor').value = JSON.stringify(data.game, null, 2);
    document.getElementById('editorError').textContent = '';
    document.getElementById('editModal').style.display = 'block';
  } catch (error) {
    console.error('Error loading game state:', error);
    showErrorToast('Network error while loading game state');
  }
}

function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  currentEditingGameId = null;
  document.getElementById('editorError').textContent = '';
}

async function saveGameState() {
  if (!currentEditingGameId) return;

  const editorError = document.getElementById('editorError');
  editorError.textContent = '';

  let newState;
  try {
    newState = JSON.parse(document.getElementById('stateEditor').value);
  } catch (error) {
    editorError.textContent = 'Invalid JSON: ' + error.message;
    return;
  }

  try {
    const response = await fetch(`/admin/games/${currentEditingGameId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newState)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      // Server handles resyncing game clients
      closeEditModal();
      refreshGames();
      showSuccessToast('Game state updated and clients resynced!');
    } else {
      editorError.textContent = 'Failed to save: ' + (data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('Error saving game state:', error);
    editorError.textContent = 'Network error while saving';
  }
}

// Close modal when clicking outside
document.getElementById('editModal').addEventListener('click', (e) => {
  if (e.target.id === 'editModal') {
    closeEditModal();
  }
});

window.refreshGames = refreshGames;
window.logout = logout;
window.closeEditModal = closeEditModal;
window.saveGameState = saveGameState;
window.spectateGame = spectateGame;
window.editGameState = editGameState;
window.deleteGame = deleteGame;

// Initialize on load
window.addEventListener('resize', scheduleMetricsHistoryRedraw);
checkAuth();
