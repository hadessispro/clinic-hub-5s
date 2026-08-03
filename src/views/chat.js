import { CHANNELS } from '../constants.js';
import { getMessages, sendMessage, subscribeToMessages } from '../services/messages.js';
import { getEmployees } from '../services/employees.js';
import { store } from '../store.js';
import { escapeHTML, formatDateTime } from '../utils.js';
import { pill, emptyState } from '../components/shared.js';

let employeesList = [];
let activeSubscription = null;

export async function renderView(state) {
  const { activeChannel, employeeCode } = state;
  
  // 1. Fetch channel messages and employees cache (for author name lookup) in parallel
  const [messages, employees] = await Promise.all([
    getMessages(activeChannel),
    getEmployees()
  ]);
  
  employeesList = employees;

  const currentChannel = CHANNELS.find(c => c.id === activeChannel) || CHANNELS[0];

  // Helper function to render a message card
  const renderMessageHTML = (msg) => {
    const author = employeesList.find(e => e.id === msg.author);
    const authorName = author ? author.name : 'Quản lý';
    return `
      <article class="message-card">
        <div class="message-head">
          <strong>${escapeHTML(authorName)}</strong>
          <span class="message-time">${formatDateTime(msg.time)}</span>
        </div>
        <p>${escapeHTML(msg.text)}</p>
      </article>
    `;
  };

  return `
    <div class="view-header">
      <div>
        <p class="eyebrow">Team chat</p>
        <h3>Nhắn tin đội nhóm theo kênh phòng ban, lưu trữ real-time trên Supabase.</h3>
      </div>
    </div>

    <div class="split-layout">
      <aside class="panel">
        <div class="section-title">
          <h3>Kênh</h3>
          ${pill(CHANNELS.length)}
        </div>
        <div class="channel-list">
          ${CHANNELS.map(ch => `
            <button class="channel-button${ch.id === activeChannel ? ' active' : ''}" type="button" data-channel-id="${escapeHTML(ch.id)}">
              <span># ${escapeHTML(ch.name)}</span>
            </button>
          `).join('')}
        </div>
      </aside>

      <section class="panel">
        <div class="section-title">
          <h3># ${escapeHTML(currentChannel.name)}</h3>
          ${pill(`${messages.length} tin`)}
        </div>
        <div class="chat-window">
          <div class="message-list" id="messageList" style="max-height: 400px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 10px 0;">
            ${messages.length ? messages.map(renderMessageHTML).join('') : emptyState()}
          </div>
          <form class="chat-form" id="chatForm">
            <input id="chatInput" name="text" required placeholder="Nhập tin nhắn gửi đến #${escapeHTML(currentChannel.name)}..." autocomplete="off" />
            <button class="primary-button" type="submit">Gửi</button>
          </form>
        </div>
      </section>
    </div>
  `;
}

export function initView() {
  const state = store.getState();
  const activeChannel = state.activeChannel;
  const employeeCode = state.employeeCode;
  
  const messageList = document.getElementById('messageList');
  if (messageList) {
    messageList.scrollTop = messageList.scrollHeight; // Scroll to bottom
  }

  // 1. Channel switching
  document.querySelectorAll('[data-channel-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const channelId = btn.dataset.channelId;
      store.setActiveChannel(channelId);
    });
  });

  // 2. Chat form submission
  const form = document.getElementById('chatForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      input.value = ''; // Clear input immediately
      
      try {
        await sendMessage({
          channel: activeChannel,
          author: employeeCode,
          text: text
        });
      } catch (err) {
        console.error('[Chat View] Send failed:', err);
        alert('Không gửi được tin nhắn. Vui lòng thử lại.');
      }
    });
  }

  // 3. Real-time message listener subscription
  if (activeSubscription) {
    activeSubscription.unsubscribe();
  }

  activeSubscription = subscribeToMessages(activeChannel, (newMsg) => {
    // Check if messageList is present and channel matches
    const list = document.getElementById('messageList');
    if (!list) return;
    
    // Remove empty state if present
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();
    
    const author = employeesList.find(e => e.id === newMsg.author);
    const authorName = author ? author.name : 'Quản lý';
    
    const messageCard = document.createElement('article');
    messageCard.className = 'message-card';
    messageCard.innerHTML = `
      <div class="message-head">
        <strong>${escapeHTML(authorName)}</strong>
        <span class="message-time">${formatDateTime(newMsg.time)}</span>
      </div>
      <p>${escapeHTML(newMsg.text)}</p>
    `;
    
    list.appendChild(messageCard);
    list.scrollTop = list.scrollHeight; // Scroll to bottom on new message
  });
}
