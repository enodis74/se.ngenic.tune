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

    this.registerFlowCardActions();
  }

  /**
   * registerFlowCardActions registers the run listeners for the for the flow
   * cards that activate or deactivate the use of a specific room sensor for
   * control of the system. Note that the flow card will fail if trying to
   * deactivate a sensor that is the only active sensor for the system.
   * 
   */
  registerFlowCardActions() {
    this.homey.flow.getActionCard('activate-sensor').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setActiveControl(args.device.getData().tuneId, args.device.getData().id, true);
        await args.device.setSettings({'active_control': true});
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });

    this.homey.flow.getActionCard('deactivate-sensor').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setActiveControl(args.device.getData().tuneId, args.device.getData().id, false);
        await args.device.setSettings({'active_control': false});
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });
  }
};
