module.exports = {
  apps: [{
    name: 'teuscupons',
    script: 'dist/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '800M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
