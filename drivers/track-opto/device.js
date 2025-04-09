'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('../../lib/NgenicTunesClient');

module.exports = class MyTrackOptoDevice extends Homey.Device {

  /*
   * TRACK_OPTO_SIGNAL_STRENGTH_AND_BATTERY_UPDATE_INTERVAL is used
   * to update the signal strength and battery status every 20th call
   * to updateState, giving an update frequency of once every 15 minutes.
   * 
   * This is to avoid flooding the Ngenic API with requests.
   */
  static TRACK_OPTO_SIGNAL_STRENGTH_AND_BATTERY_UPDATE_INTERVAL = 20;

  async updateState() {
    try {
      const power = await NgenicTunesClient.getNodePower(this.getData().tuneId, this.getData().id);
      const powerInWatts = power.value * 1000; // Convert kW to W
      await this.setCapabilityValue('measure_power', powerInWatts);

      if (!this.updateCounter || this.updateCounter === 0) {
        this.updateCounter = 1;
        const nodeStatus = await NgenicTunesClient.getNodeStatus(this.getData().tuneId, this.getData().id);

        if (nodeStatus !== undefined) {
          if (nodeStatus.maxBattery > 0) {
            await this.setCapabilityValue('measure_battery', (nodeStatus.battery / nodeStatus.maxBattery) * 100);
          } else {
            await this.setCapabilityValue('measure_battery', nodeStatus.battery);
          }
          await this.setCapabilityValue('measure_signal_strength', (nodeStatus.radioStatus / nodeStatus.maxRadioStatus) * 100);
          this.log ('Signal strength and battery status updated');
        }
      } else {
        this.updateCounter++;
        if (this.updateCounter >= MyTrackOptoDevice.TRACK_OPTO_SIGNAL_STRENGTH_AND_BATTERY_UPDATE_INTERVAL) {
          this.updateCounter = 0;
        }
      }
    }
    catch (error) {
      this.error('Error:', error);
    }

    this.log('updateState completed');
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Track Opto device has been initialized');
    this.updateStateCallback = this.updateState.bind(this);
    this.homey.app.registerTrackUpdateCallback(this.updateStateCallback);

    await this.updateState().catch(error => this.error('Error:', error));
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Track Opto device has been added');
  }

  /**
   * onSettings is called when the user updates the device's settings.
   * @param {object} event the onSettings event data
   * @param {object} event.oldSettings The old settings object
   * @param {object} event.newSettings The new settings object
   * @param {string[]} event.changedKeys An array of keys changed since the previous version
   * @returns {Promise<string|void>} return a custom message that will be displayed
   */
  async onSettings({ oldSettings, newSettings, changedKeys }) {
    this.log('Track Opto device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Track Opto device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Track Opto device has been deleted');
    this.homey.app.unregisterTrackUpdateCallback(this.updateStateCallback);
  }

};
