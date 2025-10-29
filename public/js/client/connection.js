// Auto-generated split from client.js
export function showConnectionStatus(status, attemptNumber = null) {
  // Create status indicator if it doesn't exist
  let statusElement = document.getElementById('connectionStatus');
  if (!statusElement) {
    statusElement = document.createElement('div');
    statusElement.id = 'connectionStatus';
    statusElement.className = 'connection-status';
    document.body.appendChild(statusElement);
  }

  // Update status
  statusElement.className = 'connection-status';

  switch(status) {
    case 'connected':
      statusElement.classList.add('status-connected');
      statusElement.textContent = 'Connected';
      // Hide after 3 seconds
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, 3000);
      statusElement.style.display = 'block';
      break;

    case 'disconnected':
      statusElement.classList.add('status-disconnected');
      statusElement.textContent = 'Disconnected - Reconnecting...';
      statusElement.style.display = 'block';
      break;

    case 'reconnecting':
      statusElement.classList.add('status-reconnecting');
      statusElement.textContent = `Reconnecting... (Attempt ${attemptNumber})`;
      statusElement.style.display = 'block';
      break;

    case 'failed':
      statusElement.classList.add('status-failed');
      statusElement.textContent = 'Connection failed - Please refresh the page';
      statusElement.style.display = 'block';
      break;
  }

  // Add to message log if renderer exists
  if (this.renderer) {
    if (status === 'connected') {
      this.renderer.addLogMessage('Connected to server');
    } else if (status === 'disconnected') {
      this.renderer.addLogMessage('Lost connection to server');
    } else if (status === 'failed') {
      this.renderer.addLogMessage('Connection failed');
    }
  }
}
