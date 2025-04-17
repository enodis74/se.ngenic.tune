'use strict';

const Homey = require('homey');
const { DateTime } = require("luxon");

module.exports = class TimeSupport {
  constructor(homey) {
    if (!TimeSupport.instance) {
      this.homey = homey;
      TimeSupport.instance = this;
    }
    
    return TimeSupport.instance;
  }

  getStartOfDayInUTC() {
    const localNow = DateTime.now().setZone(this.homey.clock.getTimezone());
    const localMidnight = localNow.startOf('day');
    const localMidnightUTC = localMidnight.toUTC().toISO();
    
    return localMidnightUTC;
  }

  getStartOfMonthInUTC() {
    const localNow = DateTime.now().setZone(this.homey.clock.getTimezone());
    const localMonth = localNow.startOf('month');
    const localMonthUTC = localMonth.toUTC().toISO();
    
    return localMonthUTC;
  }

  getStartOfYearInUTC() {
    const localNow = DateTime.now().setZone(this.homey.clock.getTimezone());
    const localYear = localNow.startOf('year');
    const localYearUTC = localYear.toUTC().toISO();
    
    return localYearUTC;
  }
}
