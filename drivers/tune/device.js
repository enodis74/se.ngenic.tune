'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('../../lib/NgenicTunesClient');
const TimeSupport = require("../../lib/TimeSupport");

module.exports = class MyTuneDevice extends Homey.Device {

  async updateState() {
    try {
      const controlSettings = await NgenicTunesClient.getControlSettings(this.getData().id);
      await this.setSettings({'control_on_spot_price': controlSettings.controlOnSpotPrice});
      await this.setSettings({'spot_price_factor_index': controlSettings.spotPriceFactorIndex});

      const targetTemperature = await NgenicTunesClient.getRoomTargetTemperature(this.getData().id);
      await this.setCapabilityValue('target_temperature', targetTemperature);

      const setPoint = await NgenicTunesClient.getNodeSetpoint(this.getData().id, this.getData().controllerId);
      await this.setCapabilityValue('measure_temperature.setpoint', setPoint.value);

      const temperatureMeasurement = await NgenicTunesClient.getNodeProcessValue(this.getData().id, this.getData().controllerId);
      await this.setCapabilityValue('measure_temperature', temperatureMeasurement.value);
      
      const outsideTemperatureMeasurement = await NgenicTunesClient.getNodeTemperature(this.getData().id, this.getData().controllerId);
      await this.setCapabilityValue('measure_temperature.outside', outsideTemperatureMeasurement.value);

      const controlValue = await NgenicTunesClient.getNodeControlValue(this.getData().id, this.getData().controllerId);
      await this.setCapabilityValue('measure_temperature.control', controlValue.value);

      const nodeStatus = await NgenicTunesClient.getNodeStatus(this.getData().id, this.getData().controllerId);

      if (nodeStatus !== undefined) {
        await this.setCapabilityValue('measure_battery', (nodeStatus.battery/nodeStatus.maxBattery)*100);
        await this.setCapabilityValue('measure_signal_strength', (nodeStatus.radioStatus/nodeStatus.maxRadioStatus)*100);
      }

      const setpointSchedules = await NgenicTunesClient.getSetpointSchedules(this.getData().id);

      if (setpointSchedules !== undefined) {
        let planning = false;
        for (const schedule of setpointSchedules) {
          if (this.homey.app.timeSupport.inPlanningPeriod(schedule.startTime, schedule.endTime)) {
            planning = true;
            break;
          }
        }
        await this.setCapabilityValue('in_planning', planning);
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
    this.log('Tune device has been initialized');
    
    await this.updateState().catch(error => this.error('Error:', error));
    this.updateStateCallback = this.updateState.bind(this);
    this.homey.app.registerUpdateCallback(this.updateStateCallback);

    this.registerCapabilityListener('target_temperature', async (value) => {
      try {
        await NgenicTunesClient.setTargetTemperature(this.getData().id, value);
      } catch (error) {
        this.error('Error:', error);
      }
    });
  }

  /**
   * onAdded is called when the user adds the device, called just after pairing.
   */
  async onAdded() {
    this.log('Tune device has been added');
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
    const controlSettings = await NgenicTunesClient.getControlSettings(this.getData().id);
    
    if (changedKeys.includes('control_on_spot_price')) {
      controlSettings.controlOnSpotPrice = newSettings.control_on_spot_price;
    }

    if (changedKeys.includes('spot_price_factor_index')) {
      controlSettings.spotPriceFactorIndex = newSettings.spot_price_factor_index;
    }

    await NgenicTunesClient.setControlSettings(this.getData().id, controlSettings);
  }

  /**
   * onRenamed is called when the user updates the device's name.
   * This method can be used this to synchronise the name to the device.
   * @param {string} name The new name
   */
  async onRenamed(name) {
    this.log('Tune device was renamed');
  }

  /**
   * onDeleted is called when the user deleted the device.
   */
  async onDeleted() {
    this.log('Tune device has been deleted');
    this.homey.app.unregisterUpdateCallback(this.updateStateCallback);
  }
};
