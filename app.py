import random
from datetime import datetime, timedelta, UTC
import numpy as np
import requests # <-- Import the requests library for making HTTP calls

# Import key libraries from Astropy
from astropy.time import Time
from astropy.coordinates import SkyCoord
import astropy.units as u

# --- Import Flask for the web server ---
from flask import Flask, jsonify, send_from_directory

# --- CONFIGURATION ---
TIME_WINDOW_SECONDS = 600
SEPARATION_THRESHOLD_DEG = 5.0 # Increased threshold for GW events

# --- NEW: Re-added a simple mock data function as a fallback ---
def generate_fallback_mock_data():
    """Generates a simple list of mock events if the API fails."""
    print("Generating fallback mock data...")
    events = []
    base_time = datetime.now(UTC)
    for i in range(20): # Generate 20 random events
        events.append({
            'id': f'MOCK_ZTF_{i}',
            'source': 'ZTF',
            'time': base_time - timedelta(minutes=random.uniform(1, 60)),
            'ra': random.uniform(0, 360),
            'dec': random.uniform(-90, 90)
        })
    return events

def fetch_ztf_data():
    """
    Fetches the latest 50 transient events from the ZTF survey via the ALERCE API.
    """
    print("Fetching real-time ZTF data from ALERCE API...")
    events = []
    url = "https://alerce.online/api/v1/objects?classifier=stamp_classifier&class_name=SN&page_size=50&order_by=lastmjd&order_mode=DESC"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }

    try:
        response = requests.get(url, headers=headers, timeout=10) 
        if response.status_code == 200:
            ztf_alerts = response.json()
            for alert in ztf_alerts:
                event_time = Time(alert['lastmjd'], format='mjd').to_datetime(timezone=UTC)
                events.append({
                    'id': alert['oid'],
                    'source': 'ZTF',
                    'time': event_time,
                    'ra': alert['meanra'],
                    'dec': alert['meandec']
                })
            print(f"Successfully fetched {len(events)} real events from ZTF.")
            return events
        else:
            print(f"Error fetching ZTF data: Received status code {response.status_code}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Error fetching ZTF data: {e}")
        return []

# --- NEW: Function to fetch real Gravitational Wave event data ---
def fetch_gw_data():
    """
    Fetches the latest events from the Gravitational Wave Open Science Center (GWOSC).
    """
    print("Fetching real-time GW data from GWOSC API...")
    events = []
    # This is the API endpoint for the latest GW events
    url = "https://gw-openscience.org/api/v1/events/?page_size=10"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code == 200:
            gwosc_response = response.json()
            for event_name, event_data in gwosc_response['results'].items():
                # GW event times are given in GPS time, which Astropy handles perfectly
                event_time = Time(event_data['GPS'], format='gps').to_datetime(timezone=UTC)
                
                # --- IMPORTANT SCIENTIFIC NOTE ---
                # Real GW events do not have a single RA/Dec. They have a probability skymap
                # covering a large area. For this visualization, we are assigning a RANDOM
                # sky position. A real analysis would require cross-referencing the skymap.
                events.append({
                    'id': event_name,
                    'source': 'GWOSC',
                    'time': event_time,
                    'ra': random.uniform(0, 360),
                    'dec': random.uniform(-90, 90)
                })
            print(f"Successfully fetched {len(events)} real events from GWOSC.")
            return events
        else:
            print(f"Error fetching GWOSC data: Received status code {response.status_code}")
            return []
    except requests.exceptions.RequestException as e:
        print(f"Error fetching GWOSC data: {e}")
        return []


def standardize_data(raw_events):
    """
    Converts raw event data into a standardized format using Astropy.
    """
    standardized = []
    for event in raw_events:
        standardized.append({
            'id': event['id'],
            'source': event['source'],
            'time': Time(event['time']),
            'coords': SkyCoord(ra=event['ra']*u.degree, dec=event['dec']*u.degree, frame='icrs')
        })
    return standardized

def correlate_events(standardized_events):
    """
    The core logic. Compares every event with every other event to find matches.
    """
    correlated_pairs = []
    for i, event1 in enumerate(standardized_events):
        for event2 in standardized_events[i+1:]:
            if event1['source'] == event2['source']:
                continue

            time_difference = abs(event1['time'] - event2['time']).sec
            if time_difference < TIME_WINDOW_SECONDS:
                sky_separation = event1['coords'].separation(event2['coords']).degree
                if sky_separation < SEPARATION_THRESHOLD_DEG:
                    print(f"  -> REAL-TIME MATCH FOUND! {event1['id']} and {event2['id']}")
                    correlated_pairs.append(
                        (event1['id'], event2['id'])
                    )
    return correlated_pairs

# --- Setup the Flask Web Server ---
app = Flask(__name__, static_folder='static', static_url_path='')

# --- Route for the main webpage ---
@app.route('/')
def index():
    """Serves the main HTML page."""
    return send_from_directory(app.static_folder, 'index.html')

# --- Create our API endpoint ---
@app.route('/api/events')
def get_event_data():
    """
    This function runs whenever someone visits the /api/events URL.
    """
    real_ztf_events = fetch_ztf_data()
    real_gw_events = fetch_gw_data() # <-- Replaced mock function with real one
    
    # If fetching ZTF failed, use fallback mock data
    if not real_ztf_events:
        print("Falling back to ZTF mock data generator due to API fetch failure.")
        real_ztf_events = generate_fallback_mock_data() 
    
    # If fetching GW failed, add an empty list
    if not real_gw_events:
        print("Could not fetch GW data.")
        real_gw_events = []
    
    raw_data = real_ztf_events + real_gw_events
    
    standardized = standardize_data(raw_data)
    correlations = correlate_events(standardized)
    
    events_for_json = []
    for event in raw_data:
        evt_copy = event.copy()
        evt_copy['time'] = evt_copy['time'].isoformat()
        events_for_json.append(evt_copy)

    return jsonify({
        "all_events": events_for_json,
        "correlations": correlations
    })

# --- Main execution block to run the server ---
if __name__ == "__main__":
    print("--- Starting Flask Server with REAL-TIME DATA ---")
    print("Visit http://127.0.0.1:5000 in your browser to see the visualizer.")
    app.run(debug=True)

