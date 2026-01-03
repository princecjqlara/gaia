/* ============================================
   Clients Module - Client CRUD & Display
   ============================================ */

const Clients = {
  // Package definitions
  packages: {
    basic: {
      name: 'Basic',
      emoji: '🟢',
      price: 1799,
      videos: 2,
      mainVideos: 1,
      photos: 2,
      capi: true,
      advancedCapi: false,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: false,
      weeklyMeeting: 0,
      lookalike: false,
      priority: false
    },
    star: {
      name: 'Star',
      emoji: '⭐',
      price: 2999,
      videos: 5,
      mainVideos: 1,
      photos: 5,
      capi: true,
      advancedCapi: false,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: true,
      weeklyMeeting: 30,
      lookalike: false,
      priority: false
    },
    fire: {
      name: 'Fire',
      emoji: '🔥',
      price: 3499,
      videos: 5,
      mainVideos: 2,
      photos: 10,
      capi: true,
      advancedCapi: false,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: true,
      weeklyMeeting: 45,
      lookalike: false,
      priority: false
    },
    crown: {
      name: 'Crown',
      emoji: '👑',
      price: 5799,
      videos: 10,
      mainVideos: 3,
      photos: 17,
      capi: true,
      advancedCapi: true,
      dailyAds: true,
      customAudience: true,
      unlimitedSetup: true,
      weeklyMeeting: 60,
      lookalike: true,
      priority: true
    },
    custom: {
      name: 'Custom',
      emoji: '🎨',
      price: 0
    }
  },

  // Create a new client object
  createClient(formData) {
    return {
      // Basic Info
      projectName: formData.projectName || '',
      clientName: formData.clientName || '',
      businessName: formData.businessName || '',
      contactDetails: formData.contactDetails || '',
      pageLink: formData.pageLink || '',
      assignedTo: formData.assignedTo || '',
      adsExpense: formData.adsExpense || 0,
      notes: formData.notes || '',
      tags: formData.tags || [],

      // Package
      package: formData.package || 'basic',
      customPackage: formData.customPackage || null,

      // Payment
      paymentStatus: formData.paymentStatus || 'unpaid',
      paymentSchedule: formData.paymentSchedule || 'monthly',
      monthsWithClient: formData.monthsWithClient || 0,
      startDate: formData.startDate || new Date().toISOString().split('T')[0],

      // Phase & Schedule
      phase: formData.phase || 'preparing',
      autoSwitch: formData.autoSwitch || false,
      autoSwitchDays: formData.autoSwitchDays || 7,
      nextPhaseDate: formData.nextPhaseDate || null,

      // Testing specific
      subscriptionUsage: formData.subscriptionUsage || 0,
      testingRound: formData.testingRound || 1,
      subscriptionStarted: formData.subscriptionStarted || false,

      // Resubscription
      resubscriptionCount: formData.resubscriptionCount || 0,

      // Priority (will be calculated)
      priority: formData.priority || 0,

      // Timestamps
      phaseEnteredAt: new Date().toISOString()
    };
  },

  // Get package info for a client
  getPackageInfo(client) {
    if (client.package === 'custom' && client.customPackage) {
      return {
        ...client.customPackage,
        name: 'Custom',
        emoji: '🎨'
      };
    }
    return this.packages[client.package] || this.packages.basic;
  },

  // Get package price
  getPackagePrice(client) {
    const pkg = this.getPackageInfo(client);
    return pkg.price || 0;
  },

  // Format price for display
  formatPrice(price) {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0
    }).format(price);
  },

  // Render a client card
  renderClientCard(client) {
    const pkg = this.getPackageInfo(client);
    const priority = client.priority || 1;

    let metaHtml = '';

    // Payment status
    const paymentClass = client.paymentStatus === 'paid' ? 'payment-paid' :
      client.paymentStatus === 'partial' ? 'payment-partial' : 'payment-unpaid';
    const paymentIcon = client.paymentStatus === 'paid' ? '✅' :
      client.paymentStatus === 'partial' ? '⚠️' : '❌';
    metaHtml += `<span class="${paymentClass}">${paymentIcon} ${client.paymentStatus}</span>`;

    // Payment schedule
    metaHtml += `<span>📅 ${client.paymentSchedule}</span>`;

    // Months with client
    if (client.monthsWithClient > 0) {
      metaHtml += `<span>⏱️ ${client.monthsWithClient}mo</span>`;
    }

    // Auto switch info
    if (client.autoSwitch && client.nextPhaseDate) {
      const daysLeft = this.getDaysUntil(client.nextPhaseDate);
      if (daysLeft >= 0) {
        metaHtml += `<span>⏰ ${daysLeft}d to switch</span>`;
      }
    }

    // Assigned user
    if (client.assignedTo) {
      metaHtml += `<span>👤 ${this.escapeHtml(client.assignedTo)}</span>`;
    }
    // Testing progress bar (only for testing phase)
    let testingHtml = '';
    if (client.phase === 'testing') {
      testingHtml = `
        <div class="testing-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${client.subscriptionUsage || 0}%"></div>
          </div>
          <div class="progress-label">
            <span>Usage: ${client.subscriptionUsage || 0}%</span>
            <span>Round #${client.testingRound || 1}</span>
          </div>
        </div>
      `;
    }

    // Tags
    let tagsHtml = '';
    if (client.tags && client.tags.length > 0) {
      tagsHtml = `<div class="client-tags" style="margin-top: var(--space-sm);">
        ${client.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
      </div>`;
    }

    return `
      <div class="client-card" data-id="${client.id}" draggable="true">
        <div class="client-priority">${priority}</div>
        <div class="client-header">
          <div>
            <div class="client-name">${this.escapeHtml(client.clientName)}</div>
            <div class="client-business">${this.escapeHtml(client.businessName)}</div>
          </div>
          <span class="client-package package-${client.package}">
            ${pkg.emoji} ${this.formatPrice(pkg.price)}
          </span>
        </div>
        <div class="client-meta">
          ${metaHtml}
        </div>
        ${testingHtml}
        ${tagsHtml}
        <div class="client-actions">
          <button class="btn btn-sm btn-ghost view-client-btn" data-id="${client.id}">👁️ View</button>
          <button class="btn btn-sm btn-ghost edit-client-btn" data-id="${client.id}">✏️ Edit</button>
          ${client.phase !== 'running' ?
        `<button class="btn btn-sm btn-success move-next-btn" data-id="${client.id}">→ Next</button>` :
        `<button class="btn btn-sm btn-secondary archive-btn" data-id="${client.id}">📦 Archive</button>`
      }
        </div>
      </div>
    `;
  },

  // Render client details for view modal
  renderClientDetails(client) {
    const pkg = this.getPackageInfo(client);

    let packageDetails = '';
    if (client.package === 'custom' && client.customPackage) {
      const cp = client.customPackage;
      packageDetails = `
        <div class="detail-section">
          <h4>Custom Package Details</h4>
          <ul>
            ${cp.videos ? `<li>${cp.videos} × 15-sec videos</li>` : ''}
            ${cp.mainVideos ? `<li>${cp.mainVideos} main video(s)</li>` : ''}
            ${cp.photos ? `<li>${cp.photos} photos</li>` : ''}
            ${cp.capi ? '<li>CAPI</li>' : ''}
            ${cp.advancedCapi ? '<li>Advanced CAPI</li>' : ''}
            ${cp.dailyAds ? '<li>Daily ads monitoring</li>' : ''}
            ${cp.unlimitedSetup ? '<li>Unlimited ad setup</li>' : ''}
            ${cp.weeklyMeeting ? `<li>Weekly 1-on-1 (${cp.weeklyMeeting} mins)</li>` : ''}
            ${cp.lookalike ? '<li>Lookalike audiences</li>' : ''}
            ${cp.priority ? '<li>Priority handling</li>' : ''}
          </ul>
          ${cp.customFeatures ? `<p><strong>Custom Features:</strong> ${this.escapeHtml(cp.customFeatures)}</p>` : ''}
        </div>
      `;
    } else {
      packageDetails = `
        <div class="detail-section">
          <h4>Package: ${pkg.emoji} ${pkg.name}</h4>
          <ul>
            <li>${pkg.videos} × 15-sec videos</li>
            <li>${pkg.mainVideos} main video(s)</li>
            <li>${pkg.photos} photos</li>
            ${pkg.capi ? '<li>CAPI</li>' : ''}
            ${pkg.advancedCapi ? '<li>Advanced CAPI</li>' : ''}
            ${pkg.dailyAds ? '<li>Daily ads monitoring</li>' : ''}
            ${pkg.customAudience ? '<li>Custom audience</li>' : ''}
            ${pkg.unlimitedSetup ? '<li>Unlimited ad setup</li>' : ''}
            ${pkg.weeklyMeeting ? `<li>Weekly 1-on-1 (${pkg.weeklyMeeting} mins)</li>` : ''}
            ${pkg.lookalike ? '<li>Lookalike audiences</li>' : ''}
            ${pkg.priority ? '<li>Priority handling</li>' : ''}
          </ul>
        </div>
      `;
    }

    return `
      <div class="client-details">
        <div class="detail-section">
          <h4>Basic Information</h4>
          <p><strong>Project:</strong> ${this.escapeHtml(client.projectName)}</p>
          <p><strong>Client:</strong> ${this.escapeHtml(client.clientName)}</p>
          <p><strong>Business:</strong> ${this.escapeHtml(client.businessName)}</p>
          <p><strong>Contact:</strong> ${this.escapeHtml(client.contactDetails) || 'N/A'}</p>
          ${client.pageLink ? `<p><strong>Page:</strong> <a href="${this.escapeHtml(client.pageLink)}" target="_blank">${this.escapeHtml(client.pageLink)}</a></p>` : ''}
        </div>
        
        ${packageDetails}
        
        <div class="detail-section">
          <h4>Payment</h4>
          <p><strong>Status:</strong> <span class="badge badge-${client.paymentStatus === 'paid' ? 'success' : client.paymentStatus === 'partial' ? 'warning' : 'danger'}">${client.paymentStatus}</span></p>
          <p><strong>Schedule:</strong> ${client.paymentSchedule}</p>
          <p><strong>Price:</strong> ${this.formatPrice(pkg.price)}</p>
          <p><strong>Months with us:</strong> ${client.monthsWithClient}</p>
          <p><strong>Start Date:</strong> ${client.startDate || 'N/A'}</p>
        </div>
        
        <div class="detail-section">
          <h4>Phase & Schedule</h4>
          <p><strong>Current Phase:</strong> <span class="badge badge-info">${client.phase}</span></p>
          <p><strong>Priority:</strong> #${client.priority || 1}</p>
          ${client.autoSwitch ? `
            <p><strong>Auto Switch:</strong> Enabled</p>
            ${client.nextPhaseDate ? `<p><strong>Next Phase Date:</strong> ${client.nextPhaseDate}</p>` : ''}
          ` : '<p><strong>Auto Switch:</strong> Disabled</p>'}
          ${client.phase === 'testing' ? `
            <p><strong>Subscription Usage:</strong> ${client.subscriptionUsage || 0}%</p>
            <p><strong>Testing Round:</strong> #${client.testingRound || 1}</p>
          ` : ''}
        </div>
        
        ${client.notes ? `
          <div class="detail-section">
            <h4>Notes</h4>
            <p>${this.escapeHtml(client.notes)}</p>
          </div>
        ` : ''}
        
        ${client.tags && client.tags.length > 0 ? `
          <div class="detail-section">
            <h4>Tags</h4>
            <div class="tags">${client.tags.map(t => `<span class="tag">${this.escapeHtml(t)}</span>`).join(' ')}</div>
          </div>
        ` : ''}
      </div>
      
      <style>
        .client-details { font-size: 0.9rem; }
        .detail-section { margin-bottom: var(--space-lg); padding-bottom: var(--space-md); border-bottom: 1px solid var(--border-light); }
        .detail-section:last-child { border-bottom: none; }
        .detail-section h4 { color: var(--primary-light); margin-bottom: var(--space-sm); font-size: 1rem; }
        .detail-section p { margin: var(--space-xs) 0; }
        .detail-section ul { margin: var(--space-sm) 0; padding-left: var(--space-lg); }
        .detail-section li { margin: var(--space-xs) 0; color: var(--text-secondary); }
      </style>
    `;
  },

  // Calculate days until a date
  getDaysUntil(dateStr) {
    const target = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = target - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  },

  // Escape HTML for safe display
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};
