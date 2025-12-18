'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('../../lib/NgenicTunesClient');

module.exports = class MySensorDevice extends Homey.Device {

  async updateState() {
    try {
      const activeControl = await NgenicTunesClient.getActiveControl(this.getData().tuneId, this.getData().id);
      await this.setSettings({'active_control': activeControl});

      this.temperatureMeasurement = await NgenicTunesClient.getNodeTemperature(this.getData().tuneId, this.getData().id);
      const temperatureOffset = this.getSetting('temperature_offset');
      await this.setCapabilityValue('measure_temperature', this.temperatureMeasurement.value + temperatureOffset);
      
      this.humidityMeasurement = await NgenicTunesClient.getNodeHumidity(this.getData().tuneId, this.getData().id);
      const humidityOffset = this.getSetting('humidity_offset');
      const adjustedHumidity = Math.min(100, Math.max(0, this.humidityMeasurement.value + humidityOffset));
      await this.setCapabilityValue('measure_humidity', adjustedHumidity);

      const nodeStatus = await NgenicTunesClient.getNodeStatus(this.getData().tuneId, this.getData().id);

      if (nodeStatus !== undefined) {
        await this.setCapabilityValue('measure_battery', (nodeStatus.battery/nodeStatus.maxBattery)*100);
        await this.setCapabilityValue('measure_signal_strength', (nodeStatus.radioStatus/nodeStatus.maxRadioStatus)*100);
      }

      this.log('updateState completed');
    }
    catch (error) {
      this.error('Error:', error);
    }
  }

  /**
   * onInit is called when the device is initialized.
   */
  async onInit() {
    this.log('Sensor device has been initialized');
    this.log('Tune ID:', this.getData().tuneId);
    this.log('Node ID:', this.getData().id);

    await this.updateState().catch(error => this.error('Error:', error));
    this.updateStateCallback = this.updateState.bind(this);
    this.homey.app.registerUpdateCallback(this.updateStateCallback);
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Sensor device has been added');
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
    if (changedKeys.includes('active_control')) {
      await NgenicTunesClient.setActiveControl(this.getData().tuneId, this.getData().id, newSettings.active_control);
    }

    if (changedKeys.includes('temperature_offset')) {
      await this.setCapabilityValue('measure_temperature', this.temperatureMeasurement.value + newSettings.temperature_offset);
    }

    if (changedKeys.includes('humidity_offset')) {
      const adjustedHumidity = Math.min(100, Math.max(0, this.humidityMeasurement.value + newSettings.humidity_offset));
      await this.setCapabilityValue('measure_humidity', adjustedHumidity);
    }
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Sensor device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Sensor device has been deleted');
    this.homey.app.unregisterUpdateCallback(this.updateStateCallback);
  }
};
