'use strict';

const Homey = require('homey');

const NgenicTunesClient = require('../../lib/NgenicTunesClient');

module.exports = class MySensorDriver extends Homey.Driver {

  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    this.log('Sensor driver has been initialized');
  }

  /**
   * onPairListDevices is called when a user is adding a device
   * and the 'list_devices' view is called.
   * This should return an array with the data of devices that are available for pairing.
   */
  async onPairListDevices() {
    var res = new Array();

    try {
      const response = await NgenicTunesClient.getTunes();
      for (let i = 0; i < response.length; i++) {
        const tune = await NgenicTunesClient.getTune(response[i].tuneUuid);

        for (let j = 0; j < tune.rooms.length; j++) {
          res.push({
            name: tune.rooms[j].name,
            data: {
              id: tune.rooms[j].nodeUuid,
              tuneId: tune.uuid,
            }
          });
        }
      } 
    } catch (error) {
      this.error('Error:', error);
      throw error; // Re-throw the error to handle it externally
    }

    return res;  
      // Example device data, note that `store` is optional
      // {
      //   name: 'My Device',
      //   data: {
      //     id: 'my-device',
      //   },
      //   store: {
      //     address: '127.0.0.1',
      //   },
      // },
  }
};
