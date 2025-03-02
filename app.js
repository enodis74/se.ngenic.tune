'use strict';

const Homey = require('homey');
const NgenicTunesClient = require('./lib/NgenicTunesClient');
const CircularList = require('./lib/CircularList');

module.exports = class NgenicTunesApp extends Homey.App {

  static UPDATE_INTERVAL = 60000; // Call a device "updateState" every minute

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Ngenic Tune has been initialized');
    this.deviceList = new CircularList();
    NgenicTunesClient.setAccessToken(this.homey.settings.get('accessToken'));

    this.homey.settings.on('set', (key) => {
      this.log(`Setting changed: ${key}`);

      if (key === 'accessToken') {
        this.log('Access token changed');
        NgenicTunesClient.setAccessToken(this.homey.settings.get('accessToken'));
      }
    });

    this.registerFlowCardActions();

    /**
     * Set up an interval to call the next updateState callback in the deviceList
     */
    this.interval = this.homey.setInterval(() => {
      const nextUpdate = this.deviceList.next();
      if (nextUpdate != null) {
        nextUpdate();
      }
    }, NgenicTunesApp.UPDATE_INTERVAL);
  }

/**
 * registerUpdateCallback registers a callback function that will be called
 * when an updateState timeout occurs.
 * 
 * @param {Function} callback - The callback function to register.
 */
registerUpdateCallback(callback) {
  if (typeof callback === 'function') {
    this.deviceList.add(callback);
  } else {
    this.error('Error: Callback is not a function');
  }
}

/**
 * unregisterUpdateCallback unregisters a previously registered update callback.
 * 
 * @param {Function} callback - The callback function to unregister.
 */
unregisterUpdateCallback(callback) {
  if (typeof callback === 'function') {
    this.deviceList.remove(callback);
  } else {
    this.error('Error: Callback is not a function');
  }
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
