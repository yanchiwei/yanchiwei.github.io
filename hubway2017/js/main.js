$(function () {
  var MAP_INIT_COORDS = [42.35397, -71.09505];
  var MAP_INIT_ZOOM = 13;
  var MAP_FLYTO_ZOOM = 15;
  var CHART_MAX_WIDTH = 190;
  var CIRCLE_MIN_RADIUS = 10;
  var CIRCLE_MAX_RADIUS = 400;
  var START_HOUR = 6;
  var END_HOUR = 21;
  var HOURS = generateHourRange(START_HOUR, END_HOUR);
  var TIME_PERIODS = HOURS.map(function(x, i) {
      return HOURS[i] + '&ndash;' + (i < HOURS.length - 1 ?
          HOURS[i + 1] : generateHourRange(END_HOUR + 1, END_HOUR + 1)[0]);
  });
  var MAP_DOT_STYLE = {
      color: '#f03',
      fillColor: '#f03',
      fillOpacity: 1.0,
      radius: 10
  };
  var MAP_DOT_HOVER_STYLE = {color: 'white', fillColor: 'white'}
  var MAP_CIRCLE_STYLE = {
      color: 'red',
      fillColor: '#f03',
      fillOpacity: 0.2,
      weight: 1,
  }
  var MAP_CIRCLE_HOVER_STYLE = {
      color: '#bbb',
      fillColor:'white',
      fillOpacity: 0.35,
      weight: 1
  }
  var MAP_CIRCLE_SELECT_STYLE = {
      color: '#bbb',
      fillColor:'#f03',
      weight: 1.5
  }

  var hubway_map = null;
  var map_dots = null;
  var map_circles = null;
  var map_spill_lines = null;
  var cur_station = null;
  var cur_sidebar_mode = 0;
  var cur_bubble_mode = 0;
  var summary = getRideAttrSummaries();
  var rides_data_sum = summary[0];
  var rides_data_max = summary[1];

  initSlider();
  initMap();
  initEventHandlers();
  setBubbleMode(0);
  updateGlobalStatistics();
  setSidebarMode(0);
  updateMap();


  function generateHourRange(start, end) {
    var hours = []
    for (i = start; i <= end; i++)
      hours.push(i > 12 ? (i - 12) + 'pm' : i == 12 ? '12pm' : i + 'am');
    return hours;
  }

  function numberWithCommas(x) {
    x = x.toString();
    var pattern = /(-?\d+)(\d{3})/;
    while (pattern.test(x))
      x = x.replace(pattern, "$1,$2");
    return x;
  }

  function getRideAttrSummaries() {
    // Gets the summaries of each ride data attribute over time.
    var sum_attrs = [];
    var max_stockout = 0;
    var max_rides = 0;
    var max_spilled = 0;
    var max_lost = 0;
    for (var t = 0; t < HOURS.length; t++) {
      var count = 0;
      var stockout = 0;
      var rides = 0;
      var spilled = 0;
      var lost = 0;
      for (var sid in rides_data[t]) {
        count += 1;
        station_stockout = rides_data[t][sid].empty_fraction;
        station_rides = rides_data[t][sid].observed_trip;
        station_spilled = 0;
        for (var key in rides_data[t][sid]) {
          if (!isNaN(key)) {
            station_spilled += rides_data[t][sid][key];
          }
        }
        station_lost = rides_data[t][sid].leave_system_trip;
        stockout += station_stockout;
        rides += station_rides;
        spilled += station_spilled;
        lost += station_lost;
        max_stockout = Math.max(max_stockout, station_stockout);
        max_rides = Math.max(max_rides, station_rides);
        max_spilled = Math.max(max_spilled, station_spilled);
        max_lost = Math.max(max_lost, station_lost);
      }
      // Get average stockout rate.
      stockout /= count;
      sum_attrs.push({
          'stockout': stockout,
          'rides': rides,
          'spilled': spilled,
          'lost': lost
      });
    }
    var max_attrs = {
        'stockout': max_stockout,
        'rides': max_rides,
        'spilled': max_spilled,
        'lost': max_lost
    };
    return [sum_attrs, max_attrs];
  }

  function updateGlobalStatistics() {
    // Summarize data.
    var t = $('#slider-ui').slider('value');
    var max_attr = 0;
    var attrs = [];
    for (var sid in rides_data[t]) {
      // Select a station attribute that will be charted.
      switch (cur_bubble_mode) {
        case 0:
          attr = rides_data[t][sid].empty_fraction;
          break;
        case 1:
          attr = rides_data[t][sid].observed_trip;
          break;
        case 2:
          attr = 0;
          for (var key in rides_data[t][sid]) {
            if (!isNaN(key))
              attr += rides_data[t][sid][key];
          }
          break;
        case 3:
          attr = rides_data[t][sid].leave_system_trip;
          break;
        default:
          attr = null;
      }
      attrs.push([sid, attr]);
      max_attr = Math.max(max_attr, attr);
    }
    // Sort stations in descending order of the attribute.
    attrs.sort(function(x, y) {
        return x[1] > y[1] ? -1 : x[1] < y[1] ? 1 : 0
    });
    // Update UI.
    $('#global_time_period > .value').html(TIME_PERIODS[t]);
    $('#global_stockout_rate > .value').text(
        (rides_data_sum[t]['stockout'] * 100).toFixed(1) + '%');
    $('#global_total_rides > .value').text(
        numberWithCommas(Math.round(rides_data_sum[t]['rides'])));
    $('#global_spilled_rides > .value').text(
        numberWithCommas(Math.round(rides_data_sum[t]['spilled'])));
    $('#global_lost_rides > .value').text(
        numberWithCommas(Math.round(rides_data_sum[t]['lost'])));
    // Populate attribute charts.
    $('#global_attr_ul').empty();
    for (var i = 0; i < attrs.length; i++) {
      if (cur_bubble_mode == 0)
        value = (attrs[i][1] * 100).toFixed(1) + '%';  // Percentage.
      else
        value = Math.round(attrs[i][1]);  // Integer.
      createChartButton(
          CHART_MAX_WIDTH * attrs[i][1] / max_attr,
          stations_data[attrs[i][0]].station,
          value
      ).click({'sid': attrs[i][0]}, function(e) {
          // Deselect active station.
          if (cur_station != e.data.sid && cur_station != null)
            setStationBubbleStyle(cur_station, false, false);
          cur_station = e.data.sid;
          setTimeout(function() {
              hubway_map.flyTo(
                  [stations_data[cur_station].lat,
                  stations_data[cur_station].lng],
                  MAP_FLYTO_ZOOM);
          }, 100);
          updateStationStatistics();
          setSidebarMode(1);
          updateMap();
          setStationBubbleStyle(e.data.sid, false, true);
      }).mouseover({'sid': attrs[i][0]}, function(e) {
          setStationBubbleStyle(e.data.sid, true, false);
      }).mouseout({'sid': attrs[i][0]}, function(e) {
          setStationBubbleStyle(
              e.data.sid,
              false,
              cur_sidebar_mode == 1 && e.data.sid == cur_station);
      }).hide().appendTo(
          $('#global_attr_ul')
      ).fadeIn();
    }
  }

  function updateStationStatistics() {
    if (cur_station != null) {
      var t = $('#slider-ui').slider('value');
      var total_spill = 0;
      var max_spill = 0;
      var spills = [];
      for (var key in rides_data[t][cur_station]) {
        // Count displaced rides.
        value = rides_data[t][cur_station][key];
        if (!isNaN(key)) {
          spills.push([key, value]);
          max_spill = Math.max(max_spill, value);
          total_spill += value;
        }
      }
      // Sort stations in descending order of displacement volumes.
      spills.sort(function(x, y) {
          return x[1] > y[1] ? -1 : x[1] < y[1] ? 1 : 0
      });
      // Update UI.
      $('#station_name').text(stations_data[cur_station].station).attr(
          'title', stations_data[cur_station].station);
      $('#station_time_period > .value').html(TIME_PERIODS[t]);
      $('#station_stockout_rate > .value').text(
          (rides_data[t][cur_station].empty_fraction * 100).toFixed(1) + '%');
      $('#station_total_rides > .value').text(
          numberWithCommas(Math.round(
              rides_data[t][cur_station].observed_trip)));
      $('#station_spilled_rides > .value').text(
          numberWithCommas(Math.round(
              total_spill)));
      $('#station_lost_rides > .value').text(
          numberWithCommas(Math.round(
              rides_data[t][cur_station].leave_system_trip)));
      // Populate displacement charts.
      $('#station_displacement_ul').empty();
      if (Math.round(total_spill) > 0) {
        // Only show displacement destinations if total is nonzero.
        for (var i = 0; i < spills.length; i++) {
          createChartButton(
              CHART_MAX_WIDTH * spills[i][1] / max_spill,
              stations_data[spills[i][0]].station,
              (spills[i][1] / total_spill * 100).toFixed(1) + '%'
          ).click({'sid': spills[i][0]}, function(e) {
              if (cur_station != e.data.sid && cur_station != null)
                setStationBubbleStyle(cur_station, false, false);
              cur_station = e.data.sid;
              setTimeout(function() {
                  hubway_map.flyTo(
                      [stations_data[cur_station].lat,
                      stations_data[cur_station].lng],
                      MAP_FLYTO_ZOOM);
              }, 100);
              updateStationStatistics();
              setSidebarMode(1);
              updateMap();
              setStationBubbleStyle(e.data.sid, false, true);
          }).mouseover({'sid': spills[i][0]}, function(e) {
              setStationBubbleStyle(e.data.sid, true, false);
          }).mouseout({'sid': spills[i][0]}, function(e) {
              setStationBubbleStyle(
                  e.data.sid,
                  false,
                  cur_sidebar_mode == 1 && e.data.sid == cur_station);
          }).hide().appendTo(
              $('#station_displacement_ul')
          ).fadeIn();
        }
      }
    }
  }

  function updateMap() {
    var t = $('#slider-ui').slider('value');
    for (var sid in map_circles) {
      // Update radius.
      switch (cur_bubble_mode) {
        case 0:
          attr = rides_data[t][sid].empty_fraction;
          max_attr = 1; // rides_data_max['stockout'];
          break;
        case 1:
          attr = rides_data[t][sid].observed_trip;
          max_attr = rides_data_max['rides'];
          break;
        case 2:
          attr = 0;
          for (var key in rides_data[t][sid]) {
            if (!isNaN(key)) {
              attr += rides_data[t][sid][key];
            }
          }
          max_attr = rides_data_max['spilled'];
          break;
        case 3:
          attr = rides_data[t][sid].leave_system_trip;
          max_attr = rides_data_max['lost'];
          break;
        default:
          attr = null;
      }
      // Nonlinear radius growth.
      map_circles[sid].setRadius(
          CIRCLE_MIN_RADIUS + Math.pow(attr / max_attr, 3 / 5) * (
          CIRCLE_MAX_RADIUS - CIRCLE_MIN_RADIUS));
    }
    // Clear lines.
    if (map_spill_lines != null) {
      for (i = 0; i < map_spill_lines.length; i++)
        hubway_map.removeLayer(map_spill_lines[i]);
    }
    map_spill_lines = [];
    // Draw lines.
    if (cur_sidebar_mode == 1) {
      // Count total displacement.
      total_spill = 0;
      for (var key in rides_data[t][cur_station]) {
        if (!isNaN(key)) {
          total_spill += rides_data[t][cur_station][key];
        }
      }
      if (Math.round(total_spill) > 0) {
        // Only draw lines if total displacement is nonzero.
        coords = [
            stations_data[cur_station].lat, stations_data[cur_station].lng];
        for (var key in rides_data[t][cur_station]) {
          if (!isNaN(key)) {
            line = L.polyline(
                [coords, [stations_data[key].lat, stations_data[key].lng]],
                {color: 'red', weight: 1.5}
            ).addTo(hubway_map);
            map_spill_lines.push(line);
          }
        }
      }
    }
  }

  function setSidebarMode(mode) {
    cur_sidebar_mode = mode;
    if (mode == 0) {
      // Global mode.
      $('#station_sidebar').hide();
      $('#global_sidebar').fadeIn();
    } else if (mode == 1) {
      // Station mode.
      $('#global_sidebar').hide();
      $('#station_sidebar').fadeIn();
    }
    initScroller();
  }

  function setBubbleMode(mode) {
    cur_bubble_mode = mode;
    // TODO(cygoh): Change button states.
    $('#global_summary_ul > li, #station_summary_ul > li').removeClass(
        'row_button_selected').addClass('row_button');
    if (mode == 0) {
      // Stockout rates.
      $('#global_stockout_rate, #station_stockout_rate').addClass(
          'row_button_selected').removeClass('row_button');
      $('#global_chart_title').text('Stockout Rates');
    } else if (mode == 1) {
      // Total pickups.
      $('#global_total_rides, #station_total_rides').addClass(
          'row_button_selected').removeClass('row_button');
      $('#global_chart_title').text('Ride Pick-ups');
    } else if (mode == 2) {
      // Displaced pickups.
      $('#global_spilled_rides, #station_spilled_rides').addClass(
          'row_button_selected').removeClass('row_button');
      $('#global_chart_title').text('Pick-up Displacements');
    } else if (mode == 3) {
      // Lost pickups.
      $('#global_lost_rides, #station_lost_rides').addClass(
          'row_button_selected').removeClass('row_button');
      $('#global_chart_title').text('Pick-up Losses')
    }
    initScroller();
  }

  function setStationBubbleStyle(sid, hover, selected) {
    if (hover == true)
      map_circles[sid].setStyle(MAP_CIRCLE_HOVER_STYLE);
    else if (selected == true)
      map_circles[sid].setStyle(MAP_CIRCLE_SELECT_STYLE);
    else
      map_circles[sid].setStyle(MAP_CIRCLE_STYLE);
    if (hover == true)
      map_dots[sid].setStyle(MAP_DOT_HOVER_STYLE);
    else
      map_dots[sid].setStyle(MAP_DOT_STYLE);
  }

  function createChartButton(bar_width, label, value) {
    var button = $('<li/>').addClass('row row_button').attr('title', label);
    $('<div/>').addClass('chart_label').text(label).appendTo(button);
    $('<div/>').addClass('value').text(value).appendTo(button);
    $('<div/>').addClass('chart').width(bar_width).appendTo(button);
    return button;
  }

  function initSlider() {
    // Create time slider.
    $('#slider-ui').slider({ 
          min: 0, 
          max: HOURS.length - 1, 
          value: 11
      }).slider('pips', {
          rest: 'label',
          labels: HOURS
      }).on('slidechange', function(e, ui) {
          updateGlobalStatistics();
          updateStationStatistics();
          updateMap();
          setSidebarMode(cur_sidebar_mode);
      });
  }

  function initScroller() {
    // Reset sidebar scroller.
    $('.nano').nanoScroller();    
    $(".nano").nanoScroller({scroll: 'top'});
  }

  function initMap() {
    hubway_map = L.map('map', {attributionControl: false}).setView(
        MAP_INIT_COORDS, MAP_INIT_ZOOM);
    L.tileLayer('https://api.mapbox.com/styles/v1/mapbox/dark-v9/tiles/256/{z}/{x}/{y}?access_token=pk.eyJ1IjoiY3lnb2giLCJhIjoiY2oxOXdsb2YzMDliZzJxcXVzdTZzY2UwbyJ9.iUU4uYvR_SFrAfPATY5jNQ', {
        maxZoom: 18,
        id: 'mapbox.dark'
    }).addTo(hubway_map);
    map_dots = {};
    map_circles = {};
    for (var sid in stations_data) {
      // Draw dots.
      var dot = L.circle(
        [stations_data[sid].lat, stations_data[sid].lng],
        MAP_DOT_STYLE).addTo(hubway_map)
      map_dots[sid] = dot;
      // Draw circles.
      var circle = L.circle(
          [stations_data[sid].lat, stations_data[sid].lng],
          MAP_CIRCLE_STYLE); //.bindPopup(stations_data[sid].station);
      map_circles[sid] = circle;
      circle.on('mouseover', L.bind(function(sid) {
          setStationBubbleStyle(sid, true, false);
      }, null, sid)).on('mouseout', L.bind(function(sid) {
          setStationBubbleStyle(sid,
              false,
              cur_sidebar_mode == 1 && sid == cur_station);
      }, null, sid)).on('click', L.bind(function(sid) {
          if (cur_station != sid && cur_station != null)
            setStationBubbleStyle(cur_station, false, false);
          cur_station = sid;
          updateStationStatistics();
          setSidebarMode(1);
          updateMap();
          if (hubway_map.getZoom() < MAP_FLYTO_ZOOM) {
            hubway_map.flyTo(
                [stations_data[sid].lat, stations_data[sid].lng],
                MAP_FLYTO_ZOOM);
          }
          setStationBubbleStyle(sid, true, true);
      }, null, sid));
      circle.addTo(hubway_map);
    }
  }

  function initEventHandlers() {
    // Back button.
    $('#button_all_stations').click(function() {
      if (cur_station != null)
        setStationBubbleStyle(cur_station, false, false);
      setSidebarMode(0);
      updateMap();
      hubway_map.flyTo(MAP_INIT_COORDS, MAP_INIT_ZOOM);
    });
    // Time period button.
    $('#global_time_period, #station_time_period').click(function() {
      t = $('#slider-ui').slider('value');
      $('#slider-ui').slider('value', (t + 1) % HOURS.length);
    });
    // Handler for bubble mode change.
    var change_mode = function(mode) {
      setBubbleMode(mode);
      updateGlobalStatistics();
      updateMap();
    }
    // Stockout rate button.
    $('#global_stockout_rate, #station_stockout_rate').click(
        change_mode.bind(null, 0));
    // Total rides button.
    $('#global_total_rides, #station_total_rides').click(
        change_mode.bind(null, 1));
    // Displaced pickups button.
    $('#global_spilled_rides, #station_spilled_rides').click(
        change_mode.bind(null, 2));
    // Lost pickups button.
    $('#global_lost_rides, #station_lost_rides').click(
        change_mode.bind(null, 3));
  }
});