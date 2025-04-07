'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('../../lib/NgenicTunesClient');

module.exports = class MyTrackHanDevice extends Homey.Device {

  async updateState() {
    try {
      const power = await NgenicTunesClient.getNodePower(this.getData().tuneId, this.getData().id);
      const powerInWatts = power.value * 1000; // Convert kW to W
      //await this.setCapabilityValue('measure_power', powerInWatts);

      const producedPower = await NgenicTunesClient.getNodeProducedPower(this.getData().tuneId, this.getData().id);
      const producedPowerInWatts = producedPower.value * 1000; // Convert kW to W
      await this.setCapabilityValue('measure_power', powerInWatts - producedPowerInWatts);
      // await this.setCapabilityValue('measure_power.produced', producedPowerInWatts);

      const currentL1 = await NgenicTunesClient.getNodeCurrentL1(this.getData().tuneId, this.getData().id);
      await this.setCapabilityValue('measure_current.L1', currentL1.value);

      const currentL2 = await NgenicTunesClient.getNodeCurrentL2(this.getData().tuneId, this.getData().id);
      await this.setCapabilityValue('measure_current.L2', currentL2.value);

      const currentL3 = await NgenicTunesClient.getNodeCurrentL3(this.getData().tuneId, this.getData().id);
      await this.setCapabilityValue('measure_current.L3', currentL3.value);
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
    this.log('Track HAN device has been initialized');
    this.updateStateCallback = this.updateState.bind(this);
    this.homey.app.registerTrackUpdateCallback(this.updateStateCallback);

    await this.updateState().catch(error => this.error('Error:', error));
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Track HAN device has been added');
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
    this.log('Track HAN device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Track HAN device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Track HAN device has been deleted');
    this.homey.app.unregisterTrackUpdateCallback(this.updateStateCallback);
  }

};
