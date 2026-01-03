// Default package details (fallback if settings not loaded)
const defaultPackageDetails = {
  basic: {
    name: 'Basic',
    emoji: '🟢',
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
    emoji: '🎨'
  }
};

// Default package prices (fallback if settings not loaded)
const defaultPrices = {
  basic: 1799,
  star: 2999,
  fire: 3499,
  crown: 5799,
  custom: 0
};

// Get package details from settings or use defaults
const getPackageDetails = () => {
  try {
    const stored = localStorage.getItem('campy_package_details');
    if (stored) {
      const details = JSON.parse(stored);
      // Merge with defaults to ensure all fields exist
      return {
        basic: { ...defaultPackageDetails.basic, ...(details.basic || {}) },
        star: { ...defaultPackageDetails.star, ...(details.star || {}) },
        fire: { ...defaultPackageDetails.fire, ...(details.fire || {}) },
        crown: { ...defaultPackageDetails.crown, ...(details.crown || {}) },
        custom: { ...defaultPackageDetails.custom, ...(details.custom || {}) }
      };
    }
  } catch (e) {
    console.error('Error loading package details:', e);
  }
  return defaultPackageDetails;
};

// Get package prices from settings or use defaults
const getPackagePrices = () => {
  try {
    const stored = localStorage.getItem('campy_package_prices');
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error('Error loading package prices:', e);
  }
  return defaultPrices;
};

// Get complete package info (details + prices merged)
const getCompletePackages = () => {
  const details = getPackageDetails();
  const prices = getPackagePrices();
  
  return {
    basic: { ...details.basic, price: prices.basic || defaultPrices.basic },
    star: { ...details.star, price: prices.star || defaultPrices.star },
    fire: { ...details.fire, price: prices.fire || defaultPrices.fire },
    crown: { ...details.crown, price: prices.crown || defaultPrices.crown },
    custom: { ...details.custom, price: prices.custom || defaultPrices.custom }
  };
};

// Export packages as a getter function to always get current info
export const getPackages = () => getCompletePackages();

// For backward compatibility, export a computed object
export const packages = getCompletePackages();

export const getPackageInfo = (client) => {
  if (client.package === 'custom' && client.customPackage) {
    return {
      ...client.customPackage,
      name: 'Custom',
      emoji: '🎨'
    };
  }
  const currentPackages = getCompletePackages();
  return currentPackages[client.package] || currentPackages.basic;
};

export const getPackagePrice = (client) => {
  const pkg = getPackageInfo(client);
  return pkg.price || 0;
};

export const formatPrice = (price) => {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0
  }).format(price);
};

