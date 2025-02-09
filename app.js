'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('./lib/NgenicTunesClient');

module.exports = class MyApp extends Homey.App {

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Ngenic Tune has been initialized');
    NgenicTunesClient.setAccessToken(this.homey.settings.get('accessToken'));

    this.homey.settings.on('set', (key) => {
      this.log(`Setting changed: ${key}`);

      if (key === 'accessToken') {
        this.log('Access token changed');
        NgenicTunesClient.setAccessToken(this.homey.settings.get('accessToken'));
        this.log('Access token:', this.homey.settings.get('accessToken'));
      }
    });
  }
};
