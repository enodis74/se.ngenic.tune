'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('../../lib/NgenicTunesClient');

module.exports = class MyOutdoorSensorDevice extends Homey.Device {

  async updateState() {
    try {
      const outsideTemperatureMeasurement = await NgenicTunesClient.getNodeTemperature(this.getData().tuneId, this.getData().id);
      this.setCapabilityValue('measure_temperature', outsideTemperatureMeasurement.value);
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
    this.log('Outdoor Sensor device has been initialized');

    this.updateState();

    this.timeout = this.homey.setTimeout(() => {
      this.log('Initial delay passed');
    
      // Start the interval
      this.interval = this.homey.setInterval(() => {
        this.updateState();
      }, 300000);
    }, NgenicTunesClient.getInitialDelay()*1000*60);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Outdoor Sensor device has been added');
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
    this.log('Outdoor Sensor device settings where changed');
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Outdoor Sensor device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Outdoor Sensor device has been deleted');
    clearTimeout(this.timeout);
    clearInterval(this.interval);
  }

};
