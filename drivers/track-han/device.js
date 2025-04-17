'use strict';

const Homey = require('homey');
const NgenicTunesClient = require('../../lib/NgenicTunesClient');
const TimeSupport = require("../../lib/TimeSupport");

module.exports = class MyTrackHanDevice extends Homey.Device {

  /*
   * TRACK_HAN_EXTRA_DATA_UPDATE_INTERVAL is used to update
   * non-realtime critical capabilities such as signal strength
   * and imported/exported energy. This data is updated every 20th
   * call to updateState, giving an update frequency of once every
   * 15 minutes for systems with maximum one Track device. If more Track
   * devices are installed all capabilities will be reported more seldom.
   * 
   * This is to avoid flooding the Ngenic API with requests.
   */
  static TRACK_HAN_EXTRA_DATA_UPDATE_INTERVAL = 20;

  async updateState() {
    try {
      const power = await NgenicTunesClient.getNodePower(this.getData().tuneId, this.getData().id);
      const powerInWatts = power.value * 1000; // Convert kW to W
      const producedPower = await NgenicTunesClient.getNodeProducedPower(this.getData().tuneId, this.getData().id);
      const producedPowerInWatts = producedPower.value * 1000; // Convert kW to W
      await this.setCapabilityValue('measure_power', powerInWatts - producedPowerInWatts);

      const currentL1 = await NgenicTunesClient.getNodeCurrentL1(this.getData().tuneId, this.getData().id);
      await this.setCapabilityValue('measure_current.L1', currentL1.value);

      const currentL2 = await NgenicTunesClient.getNodeCurrentL2(this.getData().tuneId, this.getData().id);
      await this.setCapabilityValue('measure_current.L2', currentL2.value);

      const currentL3 = await NgenicTunesClient.getNodeCurrentL3(this.getData().tuneId, this.getData().id);
      await this.setCapabilityValue('measure_current.L3', currentL3.value);

      if (this.updateCounter === undefined) {
        this.updateCounter = 0;
      }

      if (this.updateCounter % MyTrackHanDevice.TRACK_HAN_EXTRA_DATA_UPDATE_INTERVAL === 0) {
        /*
         * Update signal strength.
         */
        const nodeStatus = await NgenicTunesClient.getNodeStatus(this.getData().tuneId, this.getData().id);

        if (nodeStatus !== undefined) {
          await this.setCapabilityValue('measure_signal_strength', (nodeStatus.radioStatus / nodeStatus.maxRadioStatus) * 100);
          this.log ('Signal strength updated');
        }

        /*
         * Update total imported/exported energy.
         */
        let startDate = new Date(0).toISOString(); // Dynamically generate start date
        let endDate = new Date().toISOString(); // Use the current date as the end date

        this.log('Start date:', startDate);
        this.log('End date:', endDate);
        
        let importedEnergy = await NgenicTunesClient.getNodeImportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.imported', importedEnergy[0].value);

        let exportedEnergy = await NgenicTunesClient.getNodeExportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.exported', exportedEnergy[0].value);

        /*
         * Update imported/exported energy since midnight.
         */
        startDate = this.homey.app.timeSupport.getStartOfDayInUTC();

        importedEnergy = await NgenicTunesClient.getNodeImportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.imported_since_midnight', importedEnergy[0].value);
        
        exportedEnergy = await NgenicTunesClient.getNodeExportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.exported_since_midnight', exportedEnergy[0].value);

        /*
         * Update imported/exported energy this month.
         */
        startDate = this.homey.app.timeSupport.getStartOfMonthInUTC();
        
        importedEnergy = await NgenicTunesClient.getNodeImportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.imported_this_month', importedEnergy[0].value);
        
        exportedEnergy = await NgenicTunesClient.getNodeExportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.exported_this_month', exportedEnergy[0].value);

        /*
         * Update imported/exported energy this year.
         */
        startDate = this.homey.app.timeSupport.getStartOfYearInUTC();
        
        importedEnergy = await NgenicTunesClient.getNodeImportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.imported_this_year', importedEnergy[0].value);
        
        exportedEnergy = await NgenicTunesClient.getNodeExportedEnergy(this.getData().tuneId, this.getData().id, startDate, endDate);
        await this.setCapabilityValue('meter_power.exported_this_year', exportedEnergy[0].value);
        
        this.log ('Imported/exported energy updated');
      }
      
      this.updateCounter++;
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
