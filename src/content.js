let globalTimestamps = [];
let currentVideoTitle = '';
let settings = {
  onlyVodts: false,
  showMarker: true,
  userFilter: ''
};

function parseTimestamps(comment) {
  const regex = /~?(\d+:)?(\d+):(\d+)~?\s*(\.{0,3})\s*(.+)/g;
  const timestamps = [];
  let match;

  while ((match = regex.exec(comment)) !== null) {
    const [, hours, minutes, seconds, level, description] = match;
    const isVodTS = comment.includes(`~${hours || ''}${minutes}:${seconds}`);
    timestamps.push({
      time: (hours ? parseInt(hours) * 3600 : 0) + parseInt(minutes) * 60 + parseInt(seconds),
      level: level.length,
      description: description.trim(),
      isVodTS: isVodTS
    });
  }

  return timestamps;
}

function parseTimeString(timeString) {
  const parts = timeString.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}
  
function findTimestampComments() {
  const comments = document.querySelectorAll('#content-text');
  const timestampComments = [];
  for (const comment of comments) {
    const text = comment.textContent;
    if (text.match(/(\d+:)?(\d+):(\d+)/)) {
      timestampComments.push(text);
    }
  }
  return timestampComments;
}
  
function getVideoInfo() {
  const videoElement = document.querySelector('video');
  let title = '';
  const url = window.location.href;

  if (window.location.hostname === 'www.youtube.com' || window.location.hostname === 'youtu.be') {
    title = document.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent || 'Unknown Title';
    return {
      title: title,
      url: url,
      currentTime: videoElement ? videoElement.currentTime : 0,
      duration: videoElement ? videoElement.duration : 0
    };
  } else if (window.location.hostname === 'www.twitch.tv') {
    if (window.location.pathname.startsWith('/videos/')){
      title = document.title;
      return {
        title: title,
        url: url,
        currentTime: videoElement ? videoElement.currentTime : 0,
        duration: videoElement ? videoElement.duration : 0
      };
    } else {
      const twitchLiveTimeElement = document.querySelector('.live-time'); 
      title = document.title;
      return {
        title: title,
        url: url,
        currentTime: twitchLiveTimeElement ? parseTimeString(twitchLiveTimeElement.querySelector('span[aria-hidden="true"]').textContent) : 0,
        duration: 0
      };
    }
  }
}
  
function waitForComments(maxAttempts = 10, interval = 1000) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkComments = () => {
      const comments = document.querySelectorAll('#content-text');
      if (comments.length > 0) {
        resolve();
      } else if (attempts >= maxAttempts) {
        reject(new Error('Comments not found after maximum attempts'));
      } else {
        attempts++;
        setTimeout(checkComments, interval);
      }
    };
    checkComments();
  });
}

function getTimestamps() {
  return new Promise((resolve, reject) => {
    const videoInfo = getVideoInfo();
    if (videoInfo.title !== currentVideoTitle) {
      globalTimestamps = [];
      currentVideoTitle = videoInfo.title;
      removeTimestampDots();
    }
    
    if (globalTimestamps.length > 0) {
      resolve({ timestamps: globalTimestamps, videoInfo });
    } else {
      resolve({ timestamps: globalTimestamps, videoInfo });
      waitForComments()
        .then(() => {
          const timestampComments = findTimestampComments();
          let timestamps = [];
          for (const comment of timestampComments) {
            timestamps = timestamps.concat(parseTimestamps(comment));
          }
          timestamps.sort((a, b) => a.time - b.time);
          globalTimestamps = timestamps;
          resolve({ timestamps, videoInfo });
          if (settings.showMarker) {
            injectTimestampDots(timestamps);
          }
        })
        .catch((error) => {
          console.error('Error loading comments:', error);
          resolve({ timestamps: globalTimestamps, videoInfo });
        });
    }
  });
}

function setTimestamps(newTimestamps) {
  globalTimestamps = newTimestamps;
  removeTimestampDots();
  if (settings.showMarker) {
    injectTimestampDots(newTimestamps);
  }
}

function addTimestamp(description = '', offset = 0) {
  const videoInfo = getVideoInfo();
  if (videoInfo) {
    const currentTime = Math.floor(videoInfo.currentTime);
    const adjustedTime = Math.max(0, currentTime + offset);
    
    let level = 0;
    if (description && typeof description === 'string') {
      const levelMatch = description.match(/^(\.{0,3})/);
      level = levelMatch ? levelMatch[1].length : 0;
      description = description.replace(/^\.{0,3}/, '').trim();
    } else {
      description = '';
    }
    
    globalTimestamps.push({
      time: adjustedTime,
      level: level,
      description: description,
      isVodTS: false
    });
    globalTimestamps.sort((a, b) => a.time - b.time);
    removeTimestampDots();
    if (settings.showMarker) {
      injectTimestampDots(globalTimestamps);
    }
    return true;
  }
  return false;
}

function removeTimestampDots() {
  if (window.location.hostname !== 'www.youtube.com' && window.location.hostname !== 'youtu.be') return;

  const progressBar = document.querySelector('.ytp-progress-bar');
  if (!progressBar) return;

  const existingDots = progressBar.querySelectorAll('.timestamp-dot');
  existingDots.forEach(dot => dot.remove());
}

function injectTimestampDots(timestamps) {
  if (!settings.showMarker) return;

  const isYouTube = window.location.hostname === 'www.youtube.com' || window.location.hostname === 'youtu.be';
  const isTwitch = window.location.hostname === 'www.twitch.tv';

  if (!isYouTube && !isTwitch) return;

  let progressBar;
  if (isYouTube) {
    progressBar = document.querySelector('.ytp-progress-bar');
  } else if (isTwitch) {
    progressBar = document.querySelector('.seekbar-bar');
  }

  if (!progressBar) return;

  removeTimestampDots();

  const videoInfo = getVideoInfo();
  const videoDuration = videoInfo.duration;

  timestamps.forEach(timestamp => {
    if ((timestamp.level === 0 || timestamp.level === 1) && (!settings.onlyVodts || timestamp.isVodTS)) {
      const dot = document.createElement('div');
      dot.className = 'timestamp-dot';
      dot.style.position = 'absolute';
      dot.style.width = '0';
      dot.style.height = '0';
      dot.style.borderLeft = '5px solid transparent';
      dot.style.borderRight = '5px solid transparent';
      dot.style.borderBottom = `10px solid ${timestamp.level === 0 ? '#fcea87' : '#2195f1'}`;
      if (isTwitch) {
        dot.style.bottom = '-10px';
      }
      // Offset the dot by half its width (5px) to center it on the timestamp
      dot.style.left = `calc(${(timestamp.time / videoDuration) * 100}% - 5px)`;
      dot.style.zIndex = '1000';

      const tooltip = document.createElement('div');
      tooltip.className = 'timestamp-tooltip';
      tooltip.textContent = timestamp.description;
      tooltip.style.position = 'absolute';
      tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      tooltip.style.color = 'white';
      tooltip.style.padding = '5px';
      tooltip.style.borderRadius = '3px';
      tooltip.style.fontSize = '12px';
      tooltip.style.display = 'none';
      tooltip.style.whiteSpace = 'nowrap';
      tooltip.style.marginTop = '5px';

      if (timestamp.time < videoDuration / 2) {
        tooltip.style.left = '0';
        tooltip.style.transform = 'translateY(50%)';
      } else {
        tooltip.style.right = '0';
        tooltip.style.transform = 'translateY(50%)';
      }

      dot.appendChild(tooltip);

      dot.addEventListener('mouseover', () => {
        tooltip.style.display = 'block';
      });

      dot.addEventListener('mouseout', () => {
        tooltip.style.display = 'none';
      });

      progressBar.appendChild(dot);
    }
  });
}

function editTimestamp(time, newDescription) {
  const timestampIndex = globalTimestamps.findIndex(t => t.time === time);
  if (timestampIndex !== -1) {
    globalTimestamps[timestampIndex].description = newDescription;
    removeTimestampDots();
    if (settings.showMarker) {
      injectTimestampDots(globalTimestamps);
    }
    return true;
  }
  return false;
}

function getUserList() {
  const userSet = new Set();
  globalTimestamps.forEach(timestamp => {
    const userMatch = timestamp.description.match(/^([^:]+):/);
    if (userMatch) {
      userSet.add(userMatch[1].trim());
    }
  });
  return Array.from(userSet);
}

function filterTimestamps(timestamps) {
  if (settings.onlyVodts) {
    timestamps = timestamps.filter(t => t.isVodTS);
  }
  if (settings.userFilter) {
    timestamps = timestamps.filter(t => t.description.toLowerCase().startsWith(settings.userFilter.toLowerCase() + ':'));
  }
  return timestamps;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTimestamps') {
    getTimestamps()
      .then((result) => {
        result.timestamps = filterTimestamps(result.timestamps);
        sendResponse(result);
      })
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  } else if (request.action === 'setTimestamps') {
    setTimestamps(request.timestamps);
    sendResponse({ success: true });
  } else if (request.action === 'addTimestamp') {
    const success = addTimestamp(request.description, request.offset);
    sendResponse({ success });
  } else if (request.action === 'seekTo') {
    const videoElement = document.querySelector('video');
    if (videoElement) {
      videoElement.currentTime = request.time;
    }
    sendResponse({ success: true });
  } else if (request.action === 'reloadTimestamps') {
    removeTimestampDots();
    getTimestamps()
      .then(() => {
        if (settings.showMarker) {
          injectTimestampDots(filterTimestamps(globalTimestamps));
        }
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Error reloading timestamps:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  } else if (request.action === 'editTimestamp') {
    const success = editTimestamp(request.time, request.newDescription);
    sendResponse({ success });
    return true;
  } else if (request.action === 'updateSettings') {
    settings = { ...settings, ...request.settings };
    if (settings.showMarker) {
      injectTimestampDots(filterTimestamps(globalTimestamps));
    } else {
      removeTimestampDots();
    }
    sendResponse({ success: true });
  } else if (request.action === 'getUserList') {
    sendResponse({ users: getUserList() });
  }
  return true;
});
  
window.addEventListener('load', () => {
  chrome.storage.local.get(['onlyVodTS', 'displayMarker'], (result) => {
    settings = {
      onlyVodts: result.onlyVodTS || false,
      showMarker: result.displayMarker !== false,
      userFilter: ''
    };
    getTimestamps()
      .then(() => {
        console.log('Timestamps loaded successfully');
        if (settings.showMarker) {
          injectTimestampDots(filterTimestamps(globalTimestamps));
        }
      })
      .catch((error) => {
        console.error('Error loading timestamps:', error);
      });
  });
});