# Ngenic Tune

Control your Ngenic Tune system from within Homey.

Integrate the Ngenic Tune sensors into Homey and use in automation flows.

To get started, you need to get an access token from the Ngenic Developer Portal (developer.ngenic.se).
 - Click on "GET ACCESS TOKEN"
 - Login with your Ngenic user account
 - Click on "GENERATE TOKEN"
 - Copy the generated access token and paste it into the Ngenic Tune Homey app settings
 - Tap "Save changes"

Please note that the outdoor sensor represent the heat pump's outdoor sensor, and hence might look different in reality compared to the one in the driver image (depending on the brand of the heat pump).

Sensor values are polled in a round-robin fashion, with one sensor being updated per minute, except for Track sensors that are polled every 45 seconds. This is because the Ngenic API has rate limiting per minute and per hour. Please note that the Ngenic system itself does not provide updated values more often than about every five minutes.
