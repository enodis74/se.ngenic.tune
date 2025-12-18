'use strict';

const Homey = require('homey');
const NgenicTunesClient = require('./lib/NgenicTunesClient');
const CircularList = require('./lib/CircularList');
const TimeSupport = require('./lib/TimeSupport');

module.exports = class NgenicTunesApp extends Homey.App {

  static UPDATE_INTERVAL = 60000; // Call a device "updateState" every minute
  static TRACK_UPDATE_INTERVAL = 45000; // Call a track device "updateState" every 45 seconds

  /**
   * onInit is called when the app is initialized.
   */
  async onInit() {
    this.log('Ngenic Tune has been initialized');
    this.deviceList = new CircularList();
    this.trackList = new CircularList();
    this.timeSupport = new TimeSupport(this.homey);
    NgenicTunesClient.setAccessToken(this.homey.settings.get('accessToken'));

    this.homey.settings.on('set', (key) => {
      this.log(`Setting changed: ${key}`);

      if (key === 'accessToken') {
        this.log('Access token changed');
        NgenicTunesClient.setAccessToken(this.homey.settings.get('accessToken'));
      }
    });

    this.registerSensorFlowCardActions();
    this.registerOutdoorSensorFlowCardActions();
    this.registerTuneFlowCardActions();

    /**
     * Set up an interval to call the next updateState callback in the deviceList
     */
    this.interval = this.homey.setInterval(async () => {
      const nextUpdate = this.deviceList.next();
      if (nextUpdate != null) {
        try {
          await nextUpdate(); // Execute the callback
        } catch (error) {
          this.error('Error during updateState callback execution:', error);
        }
      }
    }, NgenicTunesApp.UPDATE_INTERVAL);

    /**
     * Set up an interval to call the next updateState callback in the trackList
     */
    this.interval = this.homey.setInterval(async () => {
      const nextUpdate = this.trackList.next();
      if (nextUpdate != null) {
        try {
          await nextUpdate(); // Execute the callback
        } catch (error) {
          this.error('Error during updateState callback execution:', error);
        }
      }
    }, NgenicTunesApp.TRACK_UPDATE_INTERVAL);
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
   * registerTrackUpdateCallback registers a callback function that will be called
   * when an updateState timeout occurs for a Track device.
   * 
   * @param {Function} callback - The callback function to register.
   */
  registerTrackUpdateCallback(callback) {
    if (typeof callback === 'function') {
      this.trackList.add(callback);
    } else {
      this.error('Error: Callback is not a function');
    }
  }

  /**
   * unregisterTrackUpdateCallback unregisters a previously registered update callback.
   * 
   * @param {Function} callback - The callback function to unregister.
   */
  unregisterTrackUpdateCallback(callback) {
    if (typeof callback === 'function') {
      this.trackList.remove(callback);
    } else {
      this.error('Error: Callback is not a function');
    }
  }

  /**
   * registerOutdoorSensorFlowCardActions registers the run listeners for the flow
   * card that set the temperature offset.
   * 
   */
  registerOutdoorSensorFlowCardActions() {
    this.homey.flow.getActionCard('set_outdoor_sensor_temperature_offset').registerRunListener(async (args, state) => {
      try {
        const value = Number(args.temperature_offset);
        if (!Number.isFinite(value)) return false;
        const offset = Math.max(-5, Math.min(5, value));
        await args.device.setSettings({ 'temperature_offset': offset });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });
  }

  /**
   * registerSensorFlowCardActions registers the run listeners for the flow
   * cards that activate or deactivate the use of a specific room sensor for
   * control of the system. Note that the flow card will fail if trying to
   * deactivate a sensor that is the only active sensor for the system.
   * 
   */
  registerSensorFlowCardActions() {
    this.homey.flow.getActionCard('activate_sensor').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setActiveControl(args.device.getData().tuneId, args.device.getData().id, true);
        await args.device.setSettings({ 'active_control': true });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });

    this.homey.flow.getActionCard('deactivate_sensor').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setActiveControl(args.device.getData().tuneId, args.device.getData().id, false);
        await args.device.setSettings({ 'active_control': false });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });

    this.homey.flow.getActionCard('set_sensor_temperature_offset').registerRunListener(async (args, state) => {
      try {
        const value = Number(args.temperature_offset);
        if (!Number.isFinite(value)) return false;
        const offset = Math.max(-5, Math.min(5, value));
        await args.device.setSettings({ 'temperature_offset': offset });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });

    this.homey.flow.getActionCard('set_sensor_humidity_offset').registerRunListener(async (args, state) => {
      try {
        const value = Number(args.humidity_offset);
        if (!Number.isFinite(value)) return false;
        const offset = Math.max(-20, Math.min(20, Math.round(value)));
        await args.device.setSettings({ 'humidity_offset': offset });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });
  }

  /**
   * registerTuneFlowCardActions registers the run listeners for the flow
   * cards that activate or deactivate the "control on spot price" setting,
   * and the card for setting the spot price factor index.
   * 
   */
  registerTuneFlowCardActions() {
    this.homey.flow.getActionCard('activate_control_on_spot_price').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setControlSettings(args.device.getData().id, { 'controlOnSpotPrice': true });
        await args.device.setSettings({ 'control_on_spot_price': true });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });

    this.homey.flow.getActionCard('deactivate_control_on_spot_price').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setControlSettings(args.device.getData().id, { 'controlOnSpotPrice': false });
        await args.device.setSettings({ 'control_on_spot_price': false });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });

    this.homey.flow.getActionCard('set_spot_price_factor_index').registerRunListener(async (args, state) => {
      try {
        await NgenicTunesClient.setControlSettings(args.device.getData().id, { 'spotPriceFactorIndex': args.factor_index });
        await args.device.setSettings({ 'spot_price_factor_index': args.factor_index });
        return true;
      } catch (error) {
        this.error('Error:', error);
        return false;
      }
    });
  }
};
