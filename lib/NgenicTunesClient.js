'use strict';

const fetchPromise = import('node-fetch').then(mod => mod.default);

module.exports = class NgenicTunesClient {

    static API_URL = 'https://app.ngenic.se/api/v3/tunes';
    static ACCESS_TOKEN = '';

    static NODE_TYPE_SENSOR = 0;
    static NODE_TYPE_CONTROLLER = 1;
    static NODE_TYPE_GATEWAY = 2;
    static NODE_TYPE_GATEWAY_INTERNAL = 3;

    static HTTP_ERROR_NO_CONTENT = 204;
    static HTTP_ERROR_BAD_REQUEST = 400;
    static HTTP_ERROR_UNAUTHORIZED = 401;
    static HTTP_ERROR_FORBIDDEN = 403;
    static HTTP_ERROR_NOT_FOUND = 404;
    static HTTP_ERROR_TOO_MANY_REQUESTS = 429;

    static setAccessToken (accessToken) {
        NgenicTunesClient.ACCESS_TOKEN = accessToken;
    }

    // Method to send an HTTP request with a JSON body
    static async sendHttpRequest(url, method, accessToken, data = null, params = {}) {
        const fetch = await fetchPromise;
        // Construct query string from params object
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = queryString ? `${url}?${queryString}` : url;
    
        try {
            const options = {
                method: method, // GET, POST, PUT, DELETE, etc.
                headers: {
                    'Authorization': 'Bearer ' + accessToken,
                    'Content-Type': 'application/json'
                },
            };
    
            if (data !== null) {
                options.body = JSON.stringify(data); // Convert the data to JSON string
            }

            const response = await fetch(fullUrl, options);
      
            // Check if the response status is successful (status code 200–299)
            if (!response.ok) {
                let errorText = '';
                
                if (response.status === NgenicTunesClient.HTTP_ERROR_UNAUTHORIZED)
                    errorText = 'Unauthorized request. Please check your access token.';
                else if (response.status === NgenicTunesClient.HTTP_ERROR_TOO_MANY_REQUESTS)
                    errorText = 'Too many requests. Please try again later.';
                else
                    errorText = 'HTTP error! Status: ' + response.status;
                
                throw new Error(errorText);
            }
            /*
            else {
                console.log('Status:', response.status);
                console.log('Headers:', response.headers.raw());
            }
            */
            // Parse the JSON response body
            const responseData = await response.json();
          
            return responseData;
        } catch (error) {
            console.error('Error:', error);
            throw error; // Re-throw the error to handle it externally
        }
    }

    static async getTunes() {
        return NgenicTunesClient.sendHttpRequest(NgenicTunesClient.API_URL, 'GET', NgenicTunesClient.ACCESS_TOKEN);
    }

    static async getTune(tuneId) {
        return NgenicTunesClient.sendHttpRequest(NgenicTunesClient.API_URL + '/' + tuneId, 'GET', NgenicTunesClient.ACCESS_TOKEN);
    }

    static async getControllerUuid(tuneId) {
        const tune = await NgenicTunesClient.getTune(tuneId);

        for (let i = 0; i < tune.gateway.children.length; i++) {
            if (tune.gateway.children[i].type === NgenicTunesClient.NODE_TYPE_CONTROLLER) {
                return tune.gateway.children[i].uuid;
            }
        }
    }

    static async getControlSettings(tuneId) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/controlsettings';
        return NgenicTunesClient.sendHttpRequest(url, 'GET', NgenicTunesClient.ACCESS_TOKEN);
    }

    static async setControlSettings(tuneId, controlSettings) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/controlsettings';
        NgenicTunesClient.sendHttpRequest(url, 'PUT', NgenicTunesClient.ACCESS_TOKEN, controlSettings);
    }

    static async getNodeMeasurement(tuneId, nodeId, measurementType) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/measurements/' + nodeId + '/latest';
        return NgenicTunesClient.sendHttpRequest(url, 'GET', NgenicTunesClient.ACCESS_TOKEN, null, measurementType);
    };
    
    static async getTypeOfMeasurement(tuneId, nodeId) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/measurements/' + nodeId + '/types';
        return NgenicTunesClient.sendHttpRequest(url, 'GET', NgenicTunesClient.ACCESS_TOKEN);
    }

    static async getRooms(tuneId) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/rooms';
        return NgenicTunesClient.sendHttpRequest(url, 'GET', NgenicTunesClient.ACCESS_TOKEN);
    }

    static async setRooms(tuneId, rooms) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/rooms';
        NgenicTunesClient.sendHttpRequest(url, 'PUT', NgenicTunesClient.ACCESS_TOKEN, rooms);
    }

    static async getRoomTargetTemperature(tuneId) {
        const rooms = await NgenicTunesClient.getRooms(tuneId);

        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].activeControl === true) {
                return rooms[i].targetTemperature;
            }
        }

        throw new Error('No room with active control found');
    }

    static async setTargetTemperature(tuneId, targetTemperature) {
        const rooms = await NgenicTunesClient.getRooms(tuneId);

        for (let i = 0; i < rooms.length; i++) {
            rooms[i].targetTemperature = targetTemperature;
        }

        await NgenicTunesClient.setRooms(tuneId, rooms);
    }

    static async getActiveControl(tuneId, nodeId) {
        const rooms = await NgenicTunesClient.getRooms(tuneId);

        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].nodeUuid === nodeId) {
                return rooms[i].activeControl;
            }
        }

        throw new Error('No room with node ID found');
    }

    static async setActiveControl(tuneId, nodeId, activeControl) {
        const rooms = await NgenicTunesClient.getRooms(tuneId);
        let numOfActiveControls = 0;

        for (let i = 0; i < rooms.length; i++) {
            if (rooms[i].activeControl === true) {
                numOfActiveControls++;
            }

            if (rooms[i].nodeUuid === nodeId) {
                if (rooms[i].activeControl === true && activeControl === false) {
                    numOfActiveControls--;
                }

                rooms[i].activeControl = activeControl;
            }
        }

        if (numOfActiveControls > 0) {
            await NgenicTunesClient.setRooms(tuneId, rooms);
        } else {
            throw new Error('At least one room must have active control');
        }
    }

    static async getNodeTemperature(tuneId, nodeId) {
        return NgenicTunesClient.getNodeMeasurement(tuneId, nodeId, {type: 'temperature_C'});
    }

    static async getNodeHumidity(tuneId, nodeId) {
        return NgenicTunesClient.getNodeMeasurement(tuneId, nodeId, {type: 'humidity_relative_percent'});
    }

    static async getNodeControlValue(tuneId, nodeId) {
        return NgenicTunesClient.getNodeMeasurement(tuneId, nodeId, {type: 'control_value_C'});
    }

    static async getNodeProcessValue(tuneId, nodeId) {
        return NgenicTunesClient.getNodeMeasurement(tuneId, nodeId, {type: 'process_value_C'});
    }

    static async getNodeSetpoint(tuneId, nodeId) {
        return NgenicTunesClient.getNodeMeasurement(tuneId, nodeId, {type: 'setpoint_value_C'});
    }

    static async getNodeStatus (tuneId, nodeId) {
        const url = NgenicTunesClient.API_URL + '/' + tuneId + '/nodestatus';
        const nodeStatus = await NgenicTunesClient.sendHttpRequest(url, 'GET', NgenicTunesClient.ACCESS_TOKEN);
    
        for (let i = 0; i < nodeStatus.length; i++) {
            if (nodeStatus[i].nodeUuid === nodeId) {
                return nodeStatus[i];
            }
        }
    }
    
    static async getNodeBatteryStatus(tuneId, nodeId) {
        const nodeStatus = await NgenicTunesClient.getNodeStatus(tuneId, nodeId);
        
        if (nodeStatus !== undefined) {
            return {battery: nodeStatus.battery, maxBattery: nodeStatus.maxBattery};
        }
    }

    static async getNodeRadioStatus(tuneId, nodeId) {
        const nodeStatus = await NgenicTunesClient.getNodeStatus(tuneId, nodeId);
        
        if (nodeStatus !== undefined) {
            return {radioStatus: nodeStatus.radioStatus, maxRadioStatus: nodeStatus.maxRadioStatus};
        }
    }
}
