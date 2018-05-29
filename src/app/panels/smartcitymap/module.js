/* Banana-Modified-by-DISIT-Lab.
   Copyright (C) 2018 DISIT Lab https://www.disit.org - University of Florence

   This program is free software; you can redistribute it and/or
   modify it under the terms of the GNU General Public License
   as published by the Free Software Foundation; either version 2
   of the License, or (at your option) any later version.
   This program is distributed in the hope that it will be useful,
   but WITHOUT ANY WARRANTY; without even the implied warranty of
   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
   GNU General Public License for more details.
   You should have received a copy of the GNU General Public License
   along with this program; if not, write to the Free Software
   Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA. */

/*

  ## smartcitymap maps

  ### Parameters
  * size :: How many results to show, more results = slower
  * field :: field containing a 2 element array in the format [lon,lat]
  * tooltip :: field to extract the tool tip value from
  * spyable :: Show the 'eye' icon that reveals the last ES query
*/
define([
  'angular',
  'app',
  'underscore',
  './leaflet/leaflet-src',
  'require',
  // './leaflet/plugins', // moving it here causing error in the app, fallback to the old Kibana way.

  'css!./module.css',
  'css!./style_widgets.css',
  'css!https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css',
  'css!./leaflet/leaflet.css',
  'css!./leaflet/plugins.css'
],
function (angular, app, _, L, localRequire) {
  'use strict';

  var DEBUG = false; // DEBUG mode
  var fitBoundsFlag = true;

  var module = angular.module('kibana.panels.smartcitymap', []);
  app.useModule(module);

  module.controller('smartcitymap', function($scope, querySrv, dashboard, filterSrv) {
    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        }
      ],
      editorTabs : [
        {
          title: 'Queries',
          src: 'app/partials/querySelect.html'
        }
      ],
      status  : "Experimental",
      //description : "Displays geo points in clustered groups on a map. For better or worse, this panel does NOT use the geo-faceting capabilities of Solr. This means that it transfers more data and is generally heavier to compute, while showing less actual data. If you have a time filter, it will attempt to show to most recent points in your search, up to your defined limit. It is best used after filtering the results through other queries and filter queries, or when you want to inspect a recent sample of points."
      description : "SmartCity Map is derived from Bettermap Panel, powered with Km4City Knowledge. It is intended to show enriched SmartCity information on selected geolocalized markers, provided that tooltips are valid Km4City Service URIs."
    };

    // Set and populate defaults
    var _d = {
      queries     : {
        mode        : 'all',
        ids         : [],
        query       : '*:*',
        custom      : ''
      },
      size     : 1000,
      spyable  : true,
      lat_start: '',
      lat_end  : '',
      lon_start: '',
      lon_end  : '',
//      tooltip : "_id",
      field: null,
      show_queries: true,
      fitBoundsAuto: true,
      lat_empty: 0,
      lon_empty: 0
    };

    _.defaults($scope.panel, _d);
    $scope.requireContext = localRequire;

    // inorder to use relative paths in require calls, require needs a context to run. Without
    // setting this property the paths would be relative to the app not this context/file.

    $scope.init = function() {
      $scope.$on('refresh',function() {
     //   $scope.firstLoad = true;  
        $scope.get_data();
      });
    //  $scope.firstLoad = true; 
      $scope.panel.rndId = Math.floor(Math.random() * 9999) + 1000
      $scope.get_data();
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
    };

    $scope.fitBounds = function() {
      fitBoundsFlag = true;
      $scope.$emit('draw');
    };

    $scope.get_data = function(segment,query_id) {
      $scope.require(['./leaflet/plugins'], function () {
        $scope.panel.error =  false;
        delete $scope.panel.error;

        // Make sure we have everything for the request to complete
        if(dashboard.indices.length === 0) {
          return;
        }

        // check if [lat,lon] field is defined
        if(_.isUndefined($scope.panel.field)) {
          $scope.panel.error = "Please select a field that contains geo point in [lon,lat] format";
          return;
        }

        // Solr.js
        $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);

        var _segment = _.isUndefined(segment) ? 0 : segment;

        // var request = $scope.sjs.Request().indices(dashboard.indices);

        $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
        var boolQuery = $scope.sjs.BoolQuery();
        _.each($scope.panel.queries.ids,function(id) {
          boolQuery = boolQuery.should(querySrv.getEjsObj(id));
        });

        var request = $scope.sjs.Request().indices(dashboard.indices[_segment]);

        request = request.query(
        $scope.sjs.FilteredQuery(
          boolQuery,
          filterSrv.getBoolFilter(filterSrv.ids)
        ))
        .size($scope.panel.size); // Set the size of query result

        $scope.populate_modal(request);

        if (DEBUG) {
            console.debug('smartcitymap:\n\trequest=',request,'\n\trequest.toString()=',request.toString());
        }

        var experimental_flag = 1;
        $scope.experimental_flag = experimental_flag;

        // Build Solr query
        var fq = '';
        if (filterSrv.getSolrFq()) {
          fq = '&' + filterSrv.getSolrFq();
        }
        var query_size = $scope.panel.size;
        var wt_json = '&wt=json';
        var rows_limit;
        var sorting = '&sort=' + filterSrv.getTimeField() + ' desc'; // Only get the latest data, sorted by time field.

        // set the size of query result
        if (query_size !== undefined && query_size !== 0) {
          rows_limit = '&rows=' + query_size;
        } else { // default
          rows_limit = '&rows=25';
        }

        // FIXED LatLong Query
        if($scope.panel.lat_start && $scope.panel.lat_end && $scope.panel.lon_start && $scope.panel.lon_end && $scope.panel.field) {
          fq += '&fq=' + $scope.panel.field + ':[' + $scope.panel.lat_start + ',' + $scope.panel.lon_start + ' TO ' + $scope.panel.lat_end + ',' + $scope.panel.lon_end + ']';
        }

        // Set the panel's query
    //    $scope.panel.queries.query = querySrv.getORquery() + wt_json + rows_limit + fq + sorting;
        
        // Stessa Query ma con GROUP BY per DISTINCT VALUES
        $scope.panel.queries.query = querySrv.getORquery() + wt_json + rows_limit + fq + sorting + '&group=true&group.field=' + $scope.panel.tooltip;

        // Set the additional custom query
        if ($scope.panel.queries.custom != null) {
          request = request.setQuery($scope.panel.queries.query + $scope.panel.queries.custom);
        } else {
          request = request.setQuery($scope.panel.queries.query);
        }

        var results = request.doSearch();

        results.then(function(results) {
          $scope.panelMeta.loading = false;

          if(_segment === 0) {
            $scope.data = [];
            query_id = $scope.query_id = new Date().getTime();
          }

          // Check for error and abort if found
          if(!(_.isUndefined(results.error))) {
            $scope.panel.error = $scope.parse_error(results.error.msg);
            return;
          }

          var dataArray = [];
          if (results.grouped.service_uri != null) {
            results.grouped.service_uri.groups.forEach( function(current_value, index, initial_array) {

                var stopFlag = 1;
                dataArray.push(current_value.doclist.docs[0]);

            });
          } else if (results.grouped.serviceUri != null) {
            results.grouped.serviceUri.groups.forEach( function(current_value, index, initial_array) {

                var stopFlag = 1;
                dataArray.push(current_value.doclist.docs[0]);

            });
          }
          
        //  results.response.docs = []; 
        //  results.response.docs = dataArray;
          
          // Check that we're still on the same query, if not stop
          if($scope.query_id === query_id) {
            // Keep only what we need for the set
        //    $scope.data = $scope.data.slice(0,$scope.panel.size).concat(_.map(results.response.docs, function(hit) {
        // SOSTITUIRE CON VALORI GROUPED ( = DISTINCT)
            $scope.data = $scope.data.slice(0,$scope.panel.size).concat(_.map(dataArray, function(hit) {
              var latlon;
              if (hit[$scope.panel.field]) {
                latlon = hit[$scope.panel.field].split(',');
              } else {
                latlon = [$scope.panel.lat_empty, $scope.panel.lon_empty];
              }

              return {
                coordinates : new L.LatLng(latlon[0],latlon[1]),
                tooltip : hit[$scope.panel.tooltip]
              };
            }));

          } else {
            return;
          }

          $scope.$emit('draw');
          // Get $size results then stop querying
          // Searching Solr using Segments
          if($scope.data.length < $scope.panel.size && _segment+1 < dashboard.indices.length) {
            $scope.get_data(_segment+1, $scope.query_id);
          }
        });
      });
    };

    $scope.populate_modal = function(request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);
    };

  });

  module.directive('smartcitymap', function(filterSrv, dashboard) {
    return {
      restrict: 'A',
      link: function(scope, elem, attrs) {

        elem.html('<center><img src="img/load_big.gif"></center>');

        // Receive render events
        scope.$on('draw',function(){
          render_panel();
        });

        scope.$on('render', function(){
          if(!_.isUndefined(map)) {
            map.invalidateSize();
            map.getPanes();
          }
        });

        var map, layerGroup;  
        

        $("#Btn-geo-filter").click(
            function () {
                GeoFacet();
            }            
        );
        
        function GeoFacet() {
            
            if(_.isUndefined(map)) {
              map = L.map(attrs.id, {
                scrollWheelZoom: true,
                center: [40, -86],
                zoom: 10
              });
            } 
            
            // (X_NW, Y_NW) => north west bound point
            // (X_NE, Y_NE) => north east bound point
            // (X_SE, Y_SE) => south east bound point
            // (X_SW, Y_SW) => south west bound point
            // X:longitude, Y:latitude
         //   var negate = 'must';
            var X_NW = map.getBounds().getNorthWest().lng;
            var Y_NW = map.getBounds().getNorthWest().lat;
            var X_NE = map.getBounds().getNorthEast().lng;
            var Y_NE = map.getBounds().getNorthEast().lat;
            var X_SE = map.getBounds().getSouthEast().lng;
            var Y_SE = map.getBounds().getSouthEast().lat;
            var X_SW = map.getBounds().getSouthWest().lng;
            var Y_SW = map.getBounds().getSouthWest().lat;
            
        //    var queryString = 'fq={!field f=geolocation}Intersects(POLYGON((' + X_NW + ' ' + Y_NW + ', ' + X_NE + ' ' + Y_NE + ', ' + X_SE + ' ' + Y_SE + ', ' + X_SW + ' ' + Y_SW + ', ' + X_NW + ' ' + Y_NW + ')))';
         //   var queryString = '{!field f=geolocation}Intersects(POLYGON((' + X_NW + ' ' + Y_NW + ', ' + X_NE + ' ' + Y_NE + ', ' + X_SE + ' ' + Y_SE + ', ' + X_SW + ' ' + Y_SW + ', ' + X_NW + ' ' + Y_NW + ')))'; // QUERY OK
            
            var queryString = 'geolocation:"Intersects(POLYGON((' + X_NW + ' ' + Y_NW + ', ' + X_NE + ' ' + Y_NE + ', ' + X_SE + ' ' + Y_SE + ', ' + X_SW + ' ' + Y_SW + ', ' + X_NW + ' ' + Y_NW + ')))"';
         //   var queryString = 'agent:"ETL"';
         /*   filterSrv.set({type:'terms',field:'agent',value:'ETL'
             //   , mandate:(negate ? 'mustNot':'must')});
                }); */
            
            filterSrv.set({type:'querystring',field:'geolocation',query:queryString});
            dashboard.refresh();
            //alert("Alert Message OnClick");
        }       
        

        $(document).ready(function timeTrend(firstLoad, metricNameFromDriver, widgetTitleFromDriver, widgetHeaderColorFromDriver, widgetHeaderFontColorFromDriver, fromGisExternalContent, fromGisExternalContentServiceUri, fromGisExternalContentField, fromGisExternalContentRange, fromGisMarker, fromGisMapRef, fromGisFakeId)
        {
    /*    <?php
            $titlePatterns = array();
            $titlePatterns[0] = '/_/';
            $titlePatterns[1] = '/\'/';
            $replacements = array();
            $replacements[0] = ' ';
            $replacements[1] = '&apos;';
            $title = $_REQUEST['title_w'];
        ?>  */
        //RANGE TEMPORALI GESTIBILI DAL WIDGET: 4/HOUR, 12/HOUR, 1/DAY, 7/DAY, 30/DAY, 365/DAY (IL DRAW CANCELLA DA SOLO IL LOADING)    
      //  var widgetName = "";
        var widgetName = "timeTrend";
        var hostFile = "config";    //var hostFile = "<?= $_REQUEST['hostFile'] ?>";
        var divContainer = $("#timeTrend_content");
        var widgetContentColor = "rgba(255,255,255,1)"; //var widgetContentColor = "<?= $_REQUEST['color_w'] ?>";
        var widgetHeaderColor = "rgba(238,238,238,1)";  //var widgetHeaderColor = "<?= $_REQUEST['frame_color_w'] ?>";
        var widgetHeaderFontColor = "rgba(0,0,0,1)";    //var widgetHeaderFontColor = "<?= $_REQUEST['headerFontColor'] ?>";
        var nome_wid = "timeTrend_div";
        var linkElement = $('#timeTrend_link_w');
        var color = 'rgba(255,255,255,1)';  //var color = '<?= $_REQUEST['color_w'] ?>';
        var fontSize = "11";  //var fontSize = "<?= $_REQUEST['fontSize'] ?>";
        var fontColor = "rgba(102,102,102,1)";  //var fontColor = "<?= $_REQUEST['fontColor'] ?>";
        var timeToReload = 60;  //var timeToReload = <?= $_REQUEST['frequency_w'] ?>;
        var widgetPropertiesString, widgetProperties, thresholdObject, infoJson, styleParameters, metricType, pattern, totValues, shownValues, 
            descriptions, threshold, thresholdEval, delta, deltaPerc, seriesObj, dataObj, pieObj, legendLength,
            widgetParameters, sizeRowsWidget, desc, plotLinesArray, value, day, dayParts, timeParts, date, maxValue, nInterval, alarmSet, plotLineObj, metricName, 
            widgetTitle, countdownRef,widgetOriginalBorderColor, convertedData, serviceMapTimeRange, unitsWidget = null;
        var elToEmpty = $("#timeTrend_chartContainer");
        var url = "none";   //var url = "<?= $_REQUEST['link_w'] ?>";
        var range = "4 Ore"; //var range = "<?= $_REQUEST['temporal_range_w'] ?>"; 
        var seriesData = [];
        var valuesData = [];
        var embedWidget = false;    //var embedWidget = <?= $_REQUEST['embedWidget'] ?>;
        var embedWidgetPolicy = 'auto'; //var embedWidgetPolicy = '<?= $_REQUEST['embedWidgetPolicy'] ?>';	
        var headerHeight = 25;
        var showTitle = "yes";  //var showTitle = "<?= $_REQUEST['showTitle'] ?>";
	var showHeader = null;
        
        if(((embedWidget === true)&&(embedWidgetPolicy === 'auto'))||((embedWidget === true)&&(embedWidgetPolicy === 'manual')&&(showTitle === "no"))||((embedWidget === false)&&(showTitle === "no")&&(hostFile === "index")))
	{
           showHeader = false;
	}
	else
	{
	   showHeader = true;
	} 
        
        if(url === "null")
        {
            url = null;
        }
        
        if((metricNameFromDriver === "undefined")||(metricNameFromDriver === undefined)||(metricNameFromDriver === "null")||(metricNameFromDriver === null))
        {
            metricName = "metric";
            widgetTitle = "Time Trend";
            widgetHeaderColor = "rgba(238,238,238,1)";
            widgetHeaderFontColor = "rgba(0,0,0,1)";
        }
        else
        {
            metricName = metricNameFromDriver;
            widgetTitleFromDriver.replace(/_/g, " ");
            widgetTitleFromDriver.replace(/\'/g, "&apos;");
            widgetTitle = widgetTitleFromDriver;
            $("#" + widgetName).css("border-color", widgetHeaderColorFromDriver);
            widgetHeaderColor = widgetHeaderColorFromDriver;
            widgetHeaderFontColor = widgetHeaderFontColorFromDriver;
        }
        
        $(document).off('changeMetricFromButton_' + widgetName);
        $(document).on('changeMetricFromButton_' + widgetName, function(event) 
        {
            if((event.targetWidget === widgetName) && (event.newMetricName !== "noMetricChange"))
            {
                clearInterval(countdownRef); 
                $("#timeTrend_content").hide();
                timeTrend(true, event.newMetricName, event.newTargetTitle, event.newHeaderAndBorderColor, event.newHeaderFontColor, false, null, null, null, null, null, null);
            }
        });
        
        $(document).off('mouseOverTimeTrendFromExternalContentGis_' + widgetName);
        $(document).on('mouseOverTimeTrendFromExternalContentGis_' + widgetName, function(event) 
        {
            widgetOriginalBorderColor = $("#" + widgetName).css("border-color");
            $("#timeTrend_titleDiv").html(event.widgetTitle);
            $("#" + widgetName).css("border-color", event.color1);
            $("#timeTrend_header").css("background", event.color1);
            $("#timeTrend_header").css("background", "-webkit-linear-gradient(left, " + event.color1 + ", " + event.color2 + ")");
            $("#timeTrend_header").css("background", "-o-linear-gradient(left, " + event.color1 + ", " + event.color2 + ")");
            $("#timeTrend_header").css("background", "-moz-linear-gradient(left, " + event.color1 + ", " + event.color2 + ")");
            $("#timeTrend_header").css("background", "linear-gradient(to left, " + event.color1 + ", " + event.color2 + ")");
            $("#timeTrend_header").css("color", "black");
        });
        
        $(document).off('mouseOutTimeTrendFromExternalContentGis_' + widgetName);
        $(document).on('mouseOutTimeTrendFromExternalContentGis_' + widgetName, function(event) 
        {
            $("#timeTrend_titleDiv").html(widgetTitle);
            $("#" + widgetName).css("border-color", widgetOriginalBorderColor);
            $("#timeTrend_header").css("background", widgetHeaderColor);
            $("#timeTrend_header").css("color", widgetHeaderFontColor);
        });
        
        $(document).off('showTimeTrendFromExternalContentGis_' + widgetName);
        $(document).on('showTimeTrendFromExternalContentGis_' + widgetName, function(event) 
        {
            if(event.targetWidget === widgetName)
            {
                clearInterval(countdownRef); 
                $("#timeTrend_content").hide();
                timeTrend(true, metricName, event.widgetTitle, event.color1, "black", true, event.serviceUri, event.field, event.range, event.marker, event.mapRef, event.fakeId);
            }
        });
        
        $(document).off('restoreOriginalTimeTrendFromExternalContentGis_' + widgetName);
        $(document).on('restoreOriginalTimeTrendFromExternalContentGis_' + widgetName, function(event) 
        {
            if(event.targetWidget === widgetName)
            {
                clearInterval(countdownRef); 
                $("#timeTrend_content").hide();
                timeTrend(true, metricName, "<?= preg_replace($titlePatterns, $replacements, $title) ?>", "<?= $_REQUEST['frame_color_w'] ?>", "<?= $_REQUEST['headerFontColor'] ?>", false, null, null, null, null, null, null);
            }
        });
        
        //Definizioni di funzione specifiche del widget
        
        //Restituisce il JSON delle info se presente, altrimenti NULL
        function getInfoJson()
        {
            var infoJson = null;
            if(jQuery.parseJSON(widgetProperties.param.infoJson !== null))
            {
                infoJson = jQuery.parseJSON(widgetProperties.param.infoJson); 
            }
            
            return infoJson;
        }
        
        //Restituisce il JSON delle info se presente, altrimenti NULL
        function getStyleParameters()
        {
            var styleParameters = null;
            if(jQuery.parseJSON(widgetProperties.param.styleParameters !== null))
            {
                styleParameters = jQuery.parseJSON(widgetProperties.param.styleParameters); 
            }
            
            return styleParameters;
        }
        
        function drawDiagram(metricData, timeRange, seriesName, fromSelector)
        {   
            if(metricData.data.length > 0)
            {
                desc = metricData.data[0].commit.author.descrip;
                metricType = metricName;    //metricType = '<?= $_REQUEST['id_metric']?>';
                
                for(var i = 0; i < metricData.data.length; i++) 
                {
                    day = metricData.data[i].commit.author.computationDate;

                    if((metricData.data[i].commit.author.value !== null) && (metricData.data[i].commit.author.value !== "")) 
                    {
                        value = parseFloat(parseFloat(metricData.data[i].commit.author.value).toFixed(1));
                        var flagNumeric = true;
                    } 
                    else if((metricData.data[i].commit.author.value_perc1 !== null) && (metricData.data[i].commit.author.value_perc1 !== "")) 
                    {
                        if(value >= 100) 
                        {
                            value = parseFloat(parseFloat(metricData.data[i].commit.author.value_perc1).toFixed(0));
                        } 
                        else 
                        {
                            value = parseFloat(parseFloat(metricData.data[i].commit.author.value_perc1).toFixed(1));
                        }
                        var flagNumeric = true;
                    }

                    dayParts = day.substring(0, day.indexOf(' ')).split('-');
                    
                    if(fromSelector)
                    {
                        timeParts = day.substr(day.indexOf(' ') + 1, 5).split(':');
                        
                        if((timeRange === '1/DAY') || (timeRange.includes("HOUR"))) 
                        {
                            unitsWidget = [['millisecond', 
                            [1, 2, 5, 10, 20, 25, 50, 100, 200, 500] 
                            ], [
                                'second',
                                [1, 2, 5, 10, 15, 30]
                            ], [
                                'minute',
                                [1, 2, 5, 10, 15, 30]
                            ], [
                                'hour',
                                [1, 2, 3, 4, 6, 8, 12]
                            ], [
                                'day',
                                [1]
                            ], [
                                'week',
                                [1]
                            ], [
                                'month',
                                [1]
                                //[1, 3, 4, 6, 8, 10, 12]
                            ], [
                                'year',
                                null
                            ]];
                            date = Date.UTC(dayParts[0], dayParts[1]-1, dayParts[2], timeParts[0], timeParts[1]);
                            console.log("Sample time from ServiceMap: " + dayParts[0] + "-" + (dayParts[1])+ "-" + dayParts[2] + " " + timeParts[0] + ":" + timeParts[1]);
                        }
                        else 
                        {
                            unitsWidget = [['millisecond',  
                                [1] 
                            ], [
                                'second',
                                [1, 30]
                            ], [
                                'minute',
                                [1, 30]
                            ], [
                                'hour',
                                [1, 6]
                            ], [
                                'day',
                                [1]
                            ], [
                                'week',
                                [1]
                            ], [
                                'month',
                                [1]
                            ], [
                                'year',
                                [1]
                            ]];
                            date = Date.UTC(dayParts[0], dayParts[1] - 1, dayParts[2], timeParts[0]);
                            console.log("Sample time from ServiceMap: " + dayParts[0] + "-" + (dayParts[1])+ "-" + dayParts[2] + " - " + timeParts[0]);
                        }
                        timeParts = day.substr(day.indexOf(' ') + 1, 5).split(':');
                        date = Date.UTC(dayParts[0], dayParts[1]-1, dayParts[2], timeParts[0], timeParts[1]);
                    }
                    else
                    {
                        unitsWidget = [['millisecond', 
                            [1, 2, 5, 10, 20, 25, 50, 100, 200, 500] 
                        ], [
                            'second',
                            [1, 2, 5, 10, 15, 30]
                        ], [
                            'minute',
                            [1, 2, 5, 10, 15, 30]
                        ], [
                            'hour',
                            [1, 2, 3, 4, 6, 8, 12]
                        ], [
                            'day',
                            [1]
                        ], [
                            'week',
                            [1]
                        ], [
                            'month',
                            [1]
                            //[1, 3, 4, 6, 8, 10, 12]
                        ], [
                            'year',
                            null
                        ]];
                        if((timeRange === '1/DAY') || (timeRange.includes("HOUR"))) 
                        {
                            timeParts = day.substr(day.indexOf(' ') + 1, 5).split(':');
                            date = Date.UTC(dayParts[0], dayParts[1]-1, dayParts[2], timeParts[0], timeParts[1]);
                        }
                        else 
                        {
                            date = Date.UTC(dayParts[0], dayParts[1] - 1, dayParts[2]);
                        }
                    }
                    
                    seriesData.push([date, value]);
                    valuesData.push(value);
                }

                maxValue = Math.max.apply(Math, valuesData);
                nInterval = parseFloat((maxValue / 4).toFixed(1));

                if(flagNumeric && (thresholdObject!== null))
                {
                   plotLinesArray = []; 
                   var op, op1, op2 = null;        

                   for(var i in thresholdObject) 
                   {
                      //Semiretta sinistra
                      if((thresholdObject[i].op === "less")||(thresholdObject[i].op === "lessEqual"))
                      {
                         if(thresholdObject[i].op === "less")
                         {
                            op = "<";
                         }
                         else
                         {
                            op = "<=";
                         }

                         plotLineObj = {
                            color: thresholdObject[i].color, 
                            dashStyle: 'shortdash', 
                            value: parseFloat(thresholdObject[i].thr1), 
                            width: 1,
                            zIndex: 5,
                            label: {
                               text: thresholdObject[i].desc + " " + op + " " + thresholdObject[i].thr1,
                               y: 12
                            }
                         };
                         plotLinesArray.push(plotLineObj);
                      }
                      else
                      {
                         //Semiretta destra
                         if((thresholdObject[i].op === "greater")||(thresholdObject[i].op === "greaterEqual"))
                         {
                            if(thresholdObject[i].op === "greater")
                            {
                               op = ">";
                            }
                            else
                            {
                               op = ">=";
                            }

                            //Semiretta destra
                            plotLineObj = {
                               color: thresholdObject[i].color, 
                               dashStyle: 'shortdash', 
                               value: parseFloat(thresholdObject[i].thr1), 
                               width: 1,
                               zIndex: 5,
                               label: {
                                  text: thresholdObject[i].desc + " " + op + " " + thresholdObject[i].thr1
                               }
                            };
                            plotLinesArray.push(plotLineObj);
                         }
                         else
                         {
                            //Valore uguale a
                            if(thresholdObject[i].op === "equal")
                            {
                               op = "=";
                               plotLineObj = {
                                  color: thresholdObject[i].color, 
                                  dashStyle: 'shortdash', 
                                  value: parseFloat(thresholdObject[i].thr1), 
                                  width: 1,
                                  zIndex: 5,
                                  label: {
                                     text: thresholdObject[i].desc + " " + op + " " + thresholdObject[i].thr1
                                  }
                               };
                               plotLinesArray.push(plotLineObj);
                            }
                            else
                            {
                               //Valore diverso da
                               if(thresholdObject[i].op === "notEqual")
                               {
                                  op = "!=";
                                  plotLineObj = {
                                     color: thresholdObject[i].color, 
                                     dashStyle: 'shortdash', 
                                     value: parseFloat(thresholdObject[i].thr1), 
                                     width: 1,
                                     zIndex: 5,
                                     label: {
                                        text: thresholdObject[i].desc + " " + op + " " + thresholdObject[i].thr1
                                     }
                                  };
                                  plotLinesArray.push(plotLineObj);
                               }
                               else
                               {
                                  //Intervallo bi-limitato
                                  switch(thresholdObject[i].op)
                                  {
                                     case "intervalOpen":
                                        op1 = ">";
                                        op2 = "<";
                                        break;

                                     case "intervalClosed":
                                        op1 = ">=";
                                        op2 = "<=";
                                        break;

                                     case "intervalLeftOpen":
                                        op1 = ">";
                                        op2 = "<=";
                                        break;

                                     case "intervalRightOpen":
                                        op1 = ">=";
                                        op2 = "<";
                                        break;   
                                  }

                                  plotLineObj = {
                                     color: thresholdObject[i].color, 
                                     dashStyle: 'shortdash', 
                                     value: parseFloat(thresholdObject[i].thr1), 
                                     width: 1,
                                     zIndex: 5,
                                     label: {
                                        text: thresholdObject[i].desc + " " + op1 + " " + thresholdObject[i].thr1
                                     }
                                  };
                                  plotLinesArray.push(plotLineObj);

                                  plotLineObj = {
                                     color: thresholdObject[i].color, 
                                     dashStyle: 'shortdash', 
                                     value: parseFloat(thresholdObject[i].thr2), 
                                     width: 1,
                                     zIndex: 5,
                                     label: {
                                        text: thresholdObject[i].desc + " " + op2 + " " + thresholdObject[i].thr2,
                                        y: 12
                                     }
                                  };
                                  plotLinesArray.push(plotLineObj);
                               }
                            }
                         }
                      }
                   }

                    //Non cancellare, da recuperare quando ripristini il blink in caso di allarme
                    /*delta = Math.abs(value - threshold);

                    //Distinguiamo in base all'operatore di confronto
                    switch(thresholdEval)
                    {
                       //Allarme attivo se il valore attuale è sotto la soglia
                       case '<':
                           if(value < threshold)
                           {
                              //alarmSet = true;
                           }
                           break;

                       //Allarme attivo se il valore attuale è sopra la soglia
                       case '>':
                           if(value > threshold)
                           {
                              //alarmSet = true;
                           }
                           break;

                       //Allarme attivo se il valore attuale è uguale alla soglia (errore sui float = 0.1% la distanza dalla soglia rispetto alla soglia stessa)
                       case '=':
                           deltaPerc = (delta / threshold)*100;
                           if(deltaPerc < 0.01)
                           {
                               //alarmSet = true;
                           }
                           break;    

                       //Non gestiamo altri operatori 
                       default:
                           break;
                    }*/
                }

                if(firstLoad !== false)
                {
                    showWidgetContent(widgetName);
                    $('#timeTrend_noDataAlert').hide();
                    $("#timeTrend_chartContainer").show();
                }
                else
                {
                /*    elToEmpty.empty();
                    $('#timeTrend_noDataAlert').hide();
                    $("#timeTrend_chartContainer").show();*/
                }
                
                if(metricType === "isAlive") 
                {
                    //Calcolo del vettore delle zones
                    var myZonesArray = [];
                    
                    var newZoneItem = null;
                    var areaColor = null;
                    for(var i=1; i < seriesData.length; i++)
                    {
                        
                        switch(seriesData[i-1][1]){
                            case 2:
                                areaColor='#ff0000'; 
                                break;
                                
                             case 4:
                                 areaColor='#f96f06';
                                 break;
                                 
                             case 6:
                                 areaColor='#ffcc00';
                                 break;
                            
                            case 8:
                                areaColor='#00cc00';
                                break;
                
                       }   
                       if(i < seriesData.length-1)
                        {                                            
                            newZoneItem = {
                                value: seriesData[i][0],
                                color: areaColor
                            };
                        }
                        else
                        {
                            newZoneItem = {
                                color: areaColor
                            };
                        }
                        
                        myZonesArray.push(newZoneItem);
                    }
                  
                    //Disegno del diagramma
                    $('#timeTrend_chartContainer').highcharts({
                        credits: {
                            enabled: false
                        },
                        chart: {
                            backgroundColor: color,
                            type: 'area' 
                        },
                        exporting: {
                            enabled: false
                        },
                        title: {
                            text: ''
                        },
                         
                        xAxis: {
                            type: 'datetime',
                            units: unitsWidget,
                            labels: {
                                enabled: true,
                                style: {
                                    fontFamily: 'Verdana',
                                    color: fontColor,
                                    fontSize: fontSize + "px",
                                    "text-shadow": "1px 1px 1px rgba(0,0,0,0.12)",
                                    "textOutline": "1px 1px contrast"
                                }

                            }
                        },

                        yAxis: {
                            title: {
                                text: ''
                            },
                            min: 0,
                            max: 8,
                            tickInterval: nInterval,
                            plotLines: plotLinesArray,
                            labels: {
                                enabled: true,
                                style: {
                                    fontFamily: 'Verdana',
                                    color: fontColor,
                                    fontSize: fontSize + "px",
                                    "text-shadow": "1px 1px 1px rgba(0,0,0,0.12)",
                                    "textOutline": "1px 1px contrast"
                                },
                                formatter: function () {
                                    switch (this.value)
                                    {
                                        case 2:
                                            return "Time out";
                                            break;

                                        case 4:
                                            return "Error";
                                            break;

                                        case 6:
                                            return "Token not found";
                                            break;
                                        case 8:
                                            return "Ok";
                                            break;

                                        default:
                                            return null;
                                            break;
                                    }
                                    return this.value;
                                }

                            }
                        },
                        tooltip: {
                            valueSuffix: ''
                        },
                         
                        series: [{
                                showInLegend: false,
                                name: seriesName,
                                data: seriesData,
                                step: 'left',
                                zoneAxis: 'x',
                                zones: myZonesArray
                            }]
                   
                    });
                } 
                else 
                {
                    //Disegno del diagramma
                    
                    $('#timeTrend_chartContainer').highcharts({
                        credits: {
                            enabled: false
                        },
                        chart: {
                            backgroundColor: color,
                            type: 'spline'
                            //type: 'areaspline'
                        },
                        plotOptions: {
                            spline: {
                                
                            }
                            /*areaspline: {
                                color: '#FF0000',
                                fillColor: '#ffb3b3'
                            },
                            
                            series: {
                                lineWidth: 2
                            }*/
                        },
                        exporting: {
                            enabled: false
                        },
                        title: {
                            text: ''
                        },
                               
                        xAxis: {
                            type: 'datetime',
                            units: unitsWidget,
                            labels: {
                                enabled: true,
                                style: {
                                    fontFamily: 'Verdana',
                                    color: fontColor,
                                    fontSize: fontSize + "px",
                                    "text-shadow": "1px 1px 1px rgba(0,0,0,0.12)",
                                    "textOutline": "1px 1px contrast"
                                }
                            }
                        },
                        yAxis: {
                            title: {
                                text: ''
                            },
                            min: 0,
                            max: maxValue,
                            tickInterval: nInterval,
                            plotLines: plotLinesArray,
                            labels: {
                                enabled: true,
                                style: {
                                    fontFamily: 'Verdana',
                                    color: fontColor,
                                    fontSize: fontSize + "px",
                                    "text-shadow": "1px 1px 1px rgba(0,0,0,0.12)",
                                    "textOutline": "1px 1px contrast"
                                }
                            }
                        },
                        tooltip: 
                        {
                            valueSuffix: ''
                        },
                        series: [{
                                showInLegend: false,
                                name: seriesName,
                                data: seriesData/*,
                                fillColor: {
                                    linearGradient: {
                                        x1: 0,
                                        y1: 0,
                                        x2: 0,
                                        y2: 0
                                    },
                                    stops: [
                                        [0, '#ffb3b3'],
                                        [1, Highcharts.Color('#ffb3b3').setOpacity(0).get('rgba')]
                                    ]
                                }*/
                            }]
                    });
                }

            }
            else
            {
                showWidgetContent(widgetName);
                $("#timeTrend_chartContainer").hide();
                $('#timeTrend_noDataAlert').show();
            }
        }
        
        function convertDataFromSmToDm(originalData, field)
        {
            var singleOriginalData, singleData, convertedDate = null;
            var convertedData = {
                data: []
            };
            
            var originalDataWithNoTime = 0;
            var originalDataNotNumeric = 0;
            
            if(originalData.hasOwnProperty("realtime"))
            {
                if(originalData.realtime.hasOwnProperty("results"))
                {
                    if(originalData.realtime.results.hasOwnProperty("bindings"))
                    {
                        if(originalData.realtime.results.bindings.length > 0)
                        {
                            for(var i = 0; i < originalData.realtime.results.bindings.length; i++)
                            {
                                singleData = {
                                    commit: {
                                        author: {
                                            IdMetric_data: null, //Si può lasciare null, non viene usato dal widget
                                            computationDate: null,
                                            value_perc1: null, //Non lo useremo mai
                                            value: null,
                                            descrip: null, //Mettici il nome della metrica splittato
                                            threshold: null, //Si può lasciare null, non viene usato dal widget
                                            thresholdEval: null //Si può lasciare null, non viene usato dal widget
                                        },
                                        range_dates: 0//Si può lasciare null, non viene usato dal widget
                                    }
                                };

                                singleOriginalData = originalData.realtime.results.bindings[i];
                                if(singleOriginalData.hasOwnProperty("updating"))
                                {
                                    convertedDate = singleOriginalData.updating.value;
                                }
                                else
                                {
                                    if(singleOriginalData.hasOwnProperty("measuredTime"))
                                    {
                                        convertedDate = singleOriginalData.measuredTime.value;
                                    }
                                    else
                                    {
                                        if(singleOriginalData.hasOwnProperty("instantTime"))
                                        {
                                            convertedDate = singleOriginalData.instantTime.value;
                                        }
                                        else
                                        {
                                            originalDataWithNoTime++;
                                            continue;
                                        }
                                    }
                                }

                                convertedDate = convertedDate.replace("T", " ");
                                var plusIndex = convertedDate.indexOf("+");
                                convertedDate = convertedDate.substr(0, plusIndex);
                                singleData.commit.author.computationDate = convertedDate;
                                
                                if(!isNaN(parseFloat(singleOriginalData[field].value)))
                                {
                                    singleData.commit.author.value = parseFloat(singleOriginalData[field].value);
                                }
                                else
                                {
                                    //console.log("Categoria dato: " + field + " - Indice campione non numerico: " + i);
                                    originalDataNotNumeric++;
                                    continue;
                                }

                                convertedData.data.push(singleData);
                            }

                            return convertedData;
                        }
                        else
                        {
                            return false;
                        }
                    }
                    else
                    {
                        return false;
                    }
                }
                else
                {
                    return false;
                }
            }
            else
            {
                return false;
            }
        }
        
        //Ordinamento dei dati in ordine temporale crescente
        function convertedDataCompare(a, b) 
        {
            var dateA = new Date(a.commit.author.computationDate);
            var dateB = new Date(b.commit.author.computationDate);
            if(dateA < dateB)
            {
                return -1;
            }
            else
            {
                if(dateA > dateB)
                {
                    return 1;
                }
                else
                {
                    return 0;
                } 
            }
        }
        
        function resizeWidget()
	{
            setWidgetLayout(hostFile, widgetName, widgetContentColor, widgetHeaderColor, widgetHeaderFontColor, showHeader, headerHeight);
            
            var bodyHeight = parseInt($("#" + widgetName + "_div").prop("offsetHeight") - widgetHeaderHeight);
            $("#" + widgetName + "_loading").css("height", bodyHeight + "px");
            $("#" + widgetName + "_content").css("height", bodyHeight + "px");
	}
         
        
        
        function setWidgetLayout(hostFile, widgetName, widgetContentColor, widgetHeaderColor, widgetHeaderFontColor, showHeader, headerHeight)
        {
            var titleWidth, contentHeight = null;
            if(showHeader === true)
            {
                //Impostazione header
                $("#timeTrend_header").css("background-color", widgetHeaderColor);
                $("#timeTrend_infoButtonDiv a.info_source").css("color", widgetHeaderFontColor);
                if(widgetHeaderFontColor !== widgetHeaderColor)
                {
                    $("#timeTrend_buttonsDiv div.singleBtnContainer a.iconFullscreenModal").css("color", widgetHeaderFontColor);
                    $("#timeTrend_buttonsDiv div.singleBtnContainer a.iconFullscreenTab").css("color", widgetHeaderFontColor);
                    $("#timeTrend_countdownDiv").css("border-color", widgetHeaderFontColor);
                }

                if((!widgetName.includes("widgetButton"))&&(!widgetName.includes("widgetExternalContent"))&&(!widgetName.includes("widgetTrendMentions")))
                {
                    if(hostFile === "config")
                    {
                        if(widgetName.includes("widgetSelector"))
                        {
                            titleWidth = parseInt(parseInt($("#timeTrend_div").width() - 25 - 50 - 2));
                        }
                        else
                        {
                            titleWidth = parseInt(parseInt($("#timeTrend_div").width() - 25 - 50 - 25 - 2));
                        }
                    }
                    else
                    {
                        $("#timeTrend_buttonsDiv").css("display", "none");
                        if(widgetName.includes("widgetSelector"))
                        {
                            titleWidth = parseInt(parseInt($("#timeTrend_div").width() - 25 - 2));
                        }
                        else
                        {
                            titleWidth = parseInt(parseInt($("#timeTrend_div").width() - 25 - 25 - 2));
                        }
                    }
                    if (titleWidth <= 0) {
                        $("#timeTrend_titleDiv").css("width: 95%");
                    } else {
                        $("#timeTrend_titleDiv").css("width: 95%");
                        //$("#timeTrend_titleDiv").css("width", titleWidth + "px");
                    }
                       
                }

                $("#timeTrend_titleDiv").css("color", widgetHeaderFontColor);
                $("#timeTrend_countdownDiv").css("color", widgetHeaderFontColor);

                //Impostazione altezza widget
                contentHeight = parseInt($("#timeTrend_div").prop("offsetHeight") - headerHeight);
            }
            else
            {
                //Impostazione altezza widget
                contentHeight = parseInt($("#timeTrend_div").prop("offsetHeight"));
                $('#' + widgetName + '_header').hide();
            }

            //Impostazione colore di background del widget
            if(widgetName.indexOf("widgetGenericContent") > 0)
            {
               $("#timeTrend_content").css("background-color", widgetHeaderColor);
            }
            else
            {
               $("#timeTrend_content").css("background-color", widgetContentColor);
            }

            $("#timeTrend_content").css("height", contentHeight);
            if(widgetHeaderColor === widgetHeaderFontColor)
            {
                $("#timeTrend_titleDiv").css("text-shadow", "none");
            }
        }
        
        
        function setupLoadingPanel(widgetName, widgetContentColor, firstLoad)
        {
           var widgetHeaderHeight = 150;
            var loadingFontDim = 13;
            var loadingIconDim = 20;
            var height = parseInt($("#_div").prop("offsetHeight") - widgetHeaderHeight);	//151
            if (isNaN(height)) height = 150;
            var widgetContentColor = "rgba(255,255,255,1)";

            $("#timeTrend_loading").css("height", height + "px");
            $("#timeTrend_loading").css("background-color", widgetContentColor);
            $("#timeTrend_loading p").css("font-size", loadingFontDim + "px");
            $("#timeTrend_loading i").css("font-size", loadingIconDim + "px");
            
            $("#timeTrend_content").css("height", height + "px");
            $("#timeTrend_content").css("background-color", widgetContentColor);
            $("#timeTrend_content p").css("font-size", loadingFontDim + "px");
            $("#timeTrend_content i").css("font-size", loadingIconDim + "px");

            if(firstLoad !== false)
            {
                $("#timeTrend_loading").css("display", "block");
            } 
        }
        
        
//  COMMON_WIDGETS_LAYOUT ******************************************************
        
        
        //Usata in tutti gli widget, ma destinata ad essere eliminata: già inglobata in setWidgetLayout
function setHeaderFontColor(widget, color)
{
    $("#" + widget).css("color", color);
}

//Usata in tutti gli widget
function addLink(name, url, linkElement, elementToBeWrapped)
{
    if(url !== 'none' && url !== 'map') 
    {
        if(linkElement.length === 0)
        {
           linkElement = $("<a id='" + name + "_link_w' href='" + url + "' target='_blank' class='elementLink2'></a>");
           elementToBeWrapped.wrap(linkElement); 
        }
    }
}

//Usata in widgetTable e tutti widget sulle serie, incluso nuovo pie
function showWidgetContent(widgetName)
{
    $("#" + widgetName + "_loading").css("display", "none");
    $("#" + widgetName + "_content").css("display", "block");
}

/*
//Usata in widgetTable e tutti widget sulle serie, incluso nuovo pie
function setWidgetLayout(hostFile, widgetName, widgetContentColor, widgetHeaderColor, widgetHeaderFontColor, showHeader, headerHeight)
{
    var titleWidth, contentHeight = null;
    if(showHeader === true)
    {
        //Impostazione header
        $("#" + widgetName + "_header").css("background-color", widgetHeaderColor);
        $("#" + widgetName + "_infoButtonDiv a.info_source").css("color", widgetHeaderFontColor);
        if(widgetHeaderFontColor !== widgetHeaderColor)
        {
            $("#" + widgetName + "_buttonsDiv div.singleBtnContainer a.iconFullscreenModal").css("color", widgetHeaderFontColor);
            $("#" + widgetName + "_buttonsDiv div.singleBtnContainer a.iconFullscreenTab").css("color", widgetHeaderFontColor);
            $("#" + widgetName + "_countdownDiv").css("border-color", widgetHeaderFontColor);
        }
        
        if((!widgetName.includes("widgetButton"))&&(!widgetName.includes("widgetExternalContent"))&&(!widgetName.includes("widgetTrendMentions")))
        {
            if(hostFile === "config")
            {
                if(widgetName.includes("widgetSelector"))
                {
                    titleWidth = parseInt(parseInt($("#" + widgetName + "_div").width() - 25 - 50 - 2));
                }
                else
                {
                    titleWidth = parseInt(parseInt($("#" + widgetName + "_div").width() - 25 - 50 - 25 - 2));
                }
            }
            else
            {
                $("#" + widgetName + "_buttonsDiv").css("display", "none");
                if(widgetName.includes("widgetSelector"))
                {
                    titleWidth = parseInt(parseInt($("#" + widgetName + "_div").width() - 25 - 2));
                }
                else
                {
                    titleWidth = parseInt(parseInt($("#" + widgetName + "_div").width() - 25 - 25 - 2));
                }
            }
            $("#" + widgetName + "_titleDiv").css("width", titleWidth + "px");
        }

        $("#" + widgetName + "_titleDiv").css("color", widgetHeaderFontColor);
        $("#" + widgetName + "_countdownDiv").css("color", widgetHeaderFontColor);

        //Impostazione altezza widget
        contentHeight = parseInt($("#" + widgetName + "_div").prop("offsetHeight") - headerHeight);
    }
    else
    {
        //Impostazione altezza widget
        contentHeight = parseInt($("#" + widgetName + "_div").prop("offsetHeight"));
        $('#' + widgetName + '_header').hide();
    }
    
    //Impostazione colore di background del widget
    if(widgetName.indexOf("widgetGenericContent") > 0)
    {
       $("#" + widgetName + "_content").css("background-color", widgetHeaderColor);
    }
    else
    {
       $("#" + widgetName + "_content").css("background-color", widgetContentColor);
    }
    
    $("#" + widgetName + "_content").css("height", contentHeight);
    if(widgetHeaderColor === widgetHeaderFontColor)
    {
        $("#" + widgetName + "_titleDiv").css("text-shadow", "none");
    }
}
*/


//Usata in widgetTable e tutti widget sulle serie, incluso nuovo pie
function startCountdownOld(widgetName, timeToReload, funcRef, elToEmpty, widgetType , scrollerTimeout, eventNamesArray, metricNameFromDriverLocal, widgetTitleFromDriverLocal, widgetHeaderColorFromDriverLocal, widgetHeaderFontColorFromDriver, fromGisExternalContent, fromGisExternalContentServiceUri, fromGisExternalContentField, fromGisExternalContentRange, /*randomSingleGeoJsonIndex,*/ fromGisMarker, fromGisMapRef)
{
   var intervalRef = setInterval(function () {
        $("#" + widgetName + "_countdownDiv").text(timeToReload);
        timeToReload--;
        if (timeToReload > 60) 
        {
            $("#" + widgetName + "_countdownDiv").text(Math.floor(timeToReload / 60) + "m");
        } 
        else 
        {
            $("#" + widgetName + "_countdownDiv").text(timeToReload + "s");
        }
        
        if(timeToReload === 0) 
        {
            $("#" + widgetName + "_countdownDiv").text(timeToReload + "s");
            clearInterval(intervalRef);
            
            //Da ripristinare
            /*if(alarmSet)
            {
                $("#<?= $_GET['name'] ?>_alarmDiv").removeClass("alarmDivActive");
                $("#<?= $_GET['name'] ?>_alarmDiv").addClass("alarmDiv");  
            }*/
            setTimeout(funcRef(false, metricNameFromDriverLocal, widgetTitleFromDriverLocal, widgetHeaderColorFromDriverLocal, widgetHeaderFontColorFromDriver, fromGisExternalContent, fromGisExternalContentServiceUri, fromGisExternalContentField, fromGisExternalContentRange, /*randomSingleGeoJsonIndex,*/ fromGisMarker, fromGisMapRef), 1000);
        }
    }, 1000);
    
    return intervalRef;
}

function startCountdown(widgetName, timeToReload, funcRef, metricNameFromDriverLocal, widgetTitleFromDriverLocal, widgetHeaderColorFromDriverLocal, widgetHeaderFontColorFromDriver, fromGisExternalContent, fromGisExternalContentServiceUri, fromGisExternalContentField, fromGisExternalContentRange, fromGisMarker, fromGisMapRef, fromGisFakeId)
{
   //console.log("fromGisFakeId in start countdown: " + fromGisFakeId); 
   var intervalRef = setInterval(function () {
        $("#" + widgetName + "_countdownDiv").text(timeToReload);
        timeToReload--;
        if (timeToReload > 60) 
        {
            $("#" + widgetName + "_countdownDiv").text(Math.floor(timeToReload / 60) + "m");
        } 
        else 
        {
            $("#" + widgetName + "_countdownDiv").text(timeToReload + "s");
        }
        
        if(timeToReload === 0) 
        {
            $("#" + widgetName + "_countdownDiv").text(timeToReload + "s");
            clearInterval(intervalRef);
            
            //Da ripristinare
            /*if(alarmSet)
            {
                $("#<?= $_GET['name'] ?>_alarmDiv").removeClass("alarmDivActive");
                $("#<?= $_GET['name'] ?>_alarmDiv").addClass("alarmDiv");  
            }*/
           
            setTimeout(funcRef(false, metricNameFromDriverLocal, widgetTitleFromDriverLocal, widgetHeaderColorFromDriverLocal, widgetHeaderFontColorFromDriver, fromGisExternalContent, fromGisExternalContentServiceUri, fromGisExternalContentField, fromGisExternalContentRange, fromGisMarker, fromGisMapRef, fromGisFakeId), 1000);
        }
    }, 1000);
    
    return intervalRef;
}

/*
//Usata in widgetTable e tutti widget sulle serie, incluso nuovo pie
function setupLoadingPanel(widgetName, widgetContentColor, firstLoad)
{
    var height = parseInt($("#" + widgetName + "_div").prop("offsetHeight") - widgetHeaderHeight);
    
    $("#" + widgetName + "_loading").css("height", height + "px");
    $("#" + widgetName + "_loading").css("background-color", widgetContentColor);
    $("#" + widgetName + "_loading p").css("font-size", loadingFontDim + "px");
    $("#" + widgetName + "_loading i").css("font-size", loadingIconDim + "px");
    
    if(firstLoad !== false)
    {
        $("#" + widgetName + "_loading").css("display", "block");
    }
}
*/


//Usata in widgetTable e tutti widget sulle serie, incluso nuovo pie
function getWidgetProperties(widgetName)
{
    var properties = null;
    
    $.ajax({
        url: getParametersWidgetUrl,
        type: "GET",
        data: {"nomeWidget": [widgetName]},
        async: false,
        dataType: 'json',
        success: function (data) 
        {
            properties = data;
        },
        error: function(errorData)
        {
           console.log("Errore in caricamento proprietà widget per widget " + widgetName);
           console.log(JSON.stringify(errorData));
        }
    });
    return properties;
}

function manageInfoButtonVisibility(infoMsg, headerContainer)
{
   if(infoMsg === null || infoMsg === undefined)
   {
       if(headerContainer.attr('id').includes('alarmDivPc'))
       {
           headerContainer.find('div.pcInfoContainer a.info_source').hide();
       }
       else
       {
           headerContainer.find('div.infoButtonContainer a.info_source').hide();
       }
   }
   else
   {
        if((infoMsg.trim() === "")||(infoMsg.trim().length === 0))
        {
            if(headerContainer.attr('id').includes('alarmDivPc'))
            {
                headerContainer.find('div.pcInfoContainer a.info_source').hide();
            }
            else
            {
                headerContainer.find('div.infoButtonContainer a.info_source').hide();
            }
        }
   }
}

//Usata in widgetTable.php, dashboard_configdash.php
function getMetricData(metricId)
{
    var metricData = null;
    $.ajax({
        url: getMetricDataUrl,
        type: "GET",
        data: {"IdMisura": [metricId]},
        async: false,
        dataType: 'json',
        success: function (data) 
        {
            metricData = data;
        },
        error: function()
        {
           metricData = null;
        }
    });
    return metricData;
}

//  FINE COMMON_WIDGETS_LAYOUT *************************************************
        
        //Fine definizioni di funzione
        
        setWidgetLayout(hostFile, widgetName, widgetContentColor, widgetHeaderColor, widgetHeaderFontColor, showHeader, headerHeight);	
        
        $('#timeTrend_div').parents('li.gs_w').off('resizeWidgets');
        $('#timeTrend_div').parents('li.gs_w').on('resizeWidgets', resizeWidget);
        
        if(firstLoad === false)
        {
            showWidgetContent(widgetName);
        }
        else
        {
            setupLoadingPanel(widgetName, widgetContentColor, firstLoad);
        }
        
        addLink(widgetName, url, linkElement, divContainer);
        $("#timeTrend_titleDiv").html(widgetTitle);
        
        //Nuova versione    // PANTALEO DA CAPIRE MEGLIO SE E COME SCOMMENTARE
    /*    if(('<?= $_REQUEST['styleParameters'] ?>' !== "")&&('<?= $_REQUEST['styleParameters'] ?>' !== "null"))
        {
            styleParameters = JSON.parse('<?= $_REQUEST['styleParameters'] ?>');
        }
        
        if(('<?= $_REQUEST['parameters'] ?>' !== "")&&('<?= $_REQUEST['parameters'] ?>' !== "null"))
        {
            widgetParameters = JSON.parse('<?= $_REQUEST['parameters'] ?>');
        }
        
        if(widgetParameters !== null && widgetParameters !== undefined)
        {
            if(widgetParameters.hasOwnProperty("thresholdObject"))
            {
               thresholdObject = widgetParameters.thresholdObject; 
            }
        }
        
        sizeRowsWidget = parseInt('<?= $_REQUEST['size_rows'] ?>');         */
        
        if(fromGisExternalContent)
        {
            $('#timeTrend_infoButtonDiv a.info_source').hide();
            $('#timeTrend_infoButtonDiv i.gisDriverPin').show();

            $('#timeTrend_infoButtonDiv i.gisDriverPin').off('click');
            $('#timeTrend_infoButtonDiv i.gisDriverPin').click(function(){
                if($(this).attr('data-onMap') === 'false')
                {
                    if(fromGisMapRef.hasLayer(fromGisMarker))
                    {
                        fromGisMarker.fire('click');
                    }
                    else
                    {
                        fromGisMapRef.addLayer(fromGisMarker);
                        fromGisMarker.fire('click');
                    } 
                    $(this).attr('data-onMap', 'true');
                    $(this).html('near_me');
                    $(this).css('color', 'white');
                    $(this).css('text-shadow', '2px 2px 4px black');
                }
                else
                {
                    fromGisMapRef.removeLayer(fromGisMarker);
                    $(this).attr('data-onMap', 'false');
                    $(this).html('navigation');
                    $(this).css('color', '#337ab7');
                    $(this).css('text-shadow', 'none');
                }
            });

            switch(fromGisExternalContentRange)
            {
                case "4/HOUR":
                    serviceMapTimeRange = "fromTime=4-hour";
                    break;

                case "1/DAY":
                    serviceMapTimeRange = "fromTime=1-day";
                    break;

                case "7/DAY":
                    serviceMapTimeRange = "fromTime=7-day";
                    break;

                case "30/DAY":
                    serviceMapTimeRange = "fromTime=30-day";
                    break;     

                default:
                    serviceMapTimeRange = "fromTime=1-day";
                    break;
            }

            $.ajax({
                url: "https://servicemap.disit.org/WebAppGrafo/api/v1/?serviceUri=" + fromGisExternalContentServiceUri + "&format=json" + "&" + serviceMapTimeRange,
             //   url: "<?php echo $serviceMapUrlForTrendApi; ?>" + "?serviceUri=" + fromGisExternalContentServiceUri + "&" + serviceMapTimeRange,
                type: "GET",
                data: {},
                async: true,
                dataType: 'json',
                success: function(originalData) 
                {
                    //console.log(JSON.stringify(data));
                    var convertedData = convertDataFromSmToDm(originalData, fromGisExternalContentField);
                    if(convertedData)
                    {
                        if(convertedData.data.length > 0)
                        {
                            drawDiagram(convertedData, fromGisExternalContentRange, fromGisExternalContentField, true);
                        }
                        else
                        {
                            showWidgetContent(widgetName);
                            $("#timeTrend_chartContainer").hide();
                            $('#timeTrend_noDataAlert').show();
                            console.log("Dati non disponibili da Service Map");
                        }
                    }
                    else
                    {
                        showWidgetContent(widgetName);
                        $("#timeTrend_chartContainer").hide();
                        $('#timeTrend_noDataAlert').show();
                        console.log("Dati non disponibili da Service Map");
                    }
                    //console.log(JSON.stringify(convertDataFromSmToDm(originalData, fromGisExternalContentField)));

                },
                error: function (data)
                {
                    showWidgetContent(widgetName);
                    $("#timeTrend_chartContainer").hide();
                    $('#timeTrend_noDataAlert').show();
                    console.log("Errore in scaricamento dati da Service Map");
                    console.log(JSON.stringify(data));
                }
            });
        }
        else
        {
            $('#timeTrend_infoButtonDiv i.gisDriverPin').hide();
            $('#timeTrend_infoButtonDiv a.info_source').show();
            manageInfoButtonVisibility("<?= $_REQUEST['infoMessage_w'] ?>", $('#timeTrend_header'));

            $.ajax({
                url: "../widgets/getDataMetricsForTimeTrend.php",
                data: {"IdMisura": [metricName], "time": "<?= $_REQUEST['time'] ?>", "compare": 0},    //data: {"IdMisura": ['<?= $_REQUEST['id_metric'] ?>'], "time": "<?= $_REQUEST['time'] ?>", "compare": 0},
                type: "GET",
                async: true,
                dataType: 'json',
                success: function(metricData) 
                {   
                 //   drawDiagram(metricData, '<?= $_REQUEST['time'] ?>', '<?= $_REQUEST['id_metric'] ?>', false);
                    drawDiagram(metricData, range, metricName, false);
                },
                error: function(errorData)
                {
                    showWidgetContent(widgetName);
                    $("#timeTrend_chartContainer").hide();
                    $('#timeTrend_noDataAlert').show();
                    console.log("Errore in chiamata di getDataMetricsForTimeTrend.php.");
                    console.log(JSON.stringify(errorData));
                }
            });
        }
        
     //   countdownRef = startCountdown(widgetName, timeToReload, timeTrend, metricNameFromDriver, widgetTitleFromDriver, widgetHeaderColorFromDriver, widgetHeaderFontColorFromDriver, fromGisExternalContent, fromGisExternalContentServiceUri, fromGisExternalContentField, fromGisExternalContentRange, fromGisMarker, fromGisMapRef, fromGisFakeId);    
            
    });
        
        
        
     /*   $("#Btn-geo-filter").click(
            function (filterSrv) {
                AlertSave(filterSrv);
            }            
        ); */
        
        
    /*    function AlertSave(filterSrv) {
            
            if(_.isUndefined(map)) {
              map = L.map(attrs.id, {
                scrollWheelZoom: true,
                center: [40, -86],
                zoom: 10
              });
            } 
            filterSrv.set({type:'terms',field:'agent',value:'ETL',
          	mandate:(negate ? 'mustNot':'must')});

            alert("Alert Message OnClick");
        }   */

        
        function prepareMarker(p) {
            
            if (p.tooltip == 'undefined') {
                var mapPinImg = L.Icon.Default.imagePath + '/node-red.png';
            } else if (p.tooltip.indexOf('eCharging') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/TransferServiceAndRenting_Charging_stations.png';
            } else if (p.tooltip.indexOf('BikeRack') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/TransferServiceAndRenting_Bike_sharing_rack.png';
            } else if (p.tooltip.indexOf('SensoreViaBolognese') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/Environment_Weather_sensor.png';
            } else if (p.tooltip.indexOf('smartwaste') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/Environment_Smart_waste_container.png';
            } else if (p.tooltip.indexOf('smartbench') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/Entertainment_Smart_bench.png';
            } else if (p.tooltip.indexOf('CarPark') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/TransferServiceAndRenting_Car_park.png';
            } else if (p.tooltip.indexOf('__sensoridinamicimetro') !== -1 || p.tooltip.indexOf('METRO') !== -1) {
                var mapPinImg = L.Icon.Default.imagePath + '/RoadSensor.png';
	    }else {
                var mapPinImg = L.Icon.Default.imagePath + '/generic.png';
            }
            
            var markerIcon = L.icon({
		iconUrl: mapPinImg,
		iconAnchor: [16, 37]
            });
            var marker = new L.Marker(p.coordinates, {icon: markerIcon});
            
            marker.on('mouseover', function(event) {
                if (p.tooltip == 'undefined') {
                    var hoverImg = L.Icon.Default.imagePath + '/over/node-red_over.png';
                } else if (p.tooltip.indexOf('eCharging') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/TransferServiceAndRenting_Charging_stations_over.png';
                } else if (p.tooltip.indexOf('BikeRack') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/TransferServiceAndRenting_Bike_sharing_rack_over.png';
                } else if (p.tooltip.indexOf('SensoreViaBolognese') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/Environment_Weather_sensor_over.png';
                } else if (p.tooltip.indexOf('smartwaste') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/Environment_Smart_waste_container_over.png';
                } else if (p.tooltip.indexOf('smartbench') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/Entertainment_Smart_bench_over.png';
                } else if (p.tooltip.indexOf('CarPark') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/TransferServiceAndRenting_Car_park_over.png';
                } else if (p.tooltip.indexOf('__sensoridinamicimetro') !== -1 || p.tooltip.indexOf('METRO') !== -1) {
                    var hoverImg = L.Icon.Default.imagePath + '/over/RoadSensor_over.png';
		}else {
                    var hoverImg = L.Icon.Default.imagePath + '/generic.png';
                }
                var hoverIcon = L.icon({
                    iconUrl: hoverImg
                });
                event.target.setIcon(hoverIcon);  
                
            });
            
            marker.on('mouseout', function (event) {
                if (p.tooltip == 'undefined') {
                    var outImg = L.Icon.Default.imagePath + '/node-red.png';
                } else if (p.tooltip.indexOf('eCharging') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/TransferServiceAndRenting_Charging_stations.png';
                } else if (p.tooltip.indexOf('BikeRack') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/TransferServiceAndRenting_Bike_sharing_rack.png';
                } else if (p.tooltip.indexOf('SensoreViaBolognese') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/Environment_Weather_sensor.png';
                } else if (p.tooltip.indexOf('smartwaste') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/Environment_Smart_waste_container.png';
                } else if (p.tooltip.indexOf('smartbench') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/Entertainment_Smart_bench.png';
                } else if (p.tooltip.indexOf('CarPark') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/TransferServiceAndRenting_Car_park.png';
                } else if (p.tooltip.indexOf('__sensoridinamicimetro') !== -1 || p.tooltip.indexOf('METRO') !== -1) {
                    var outImg = L.Icon.Default.imagePath + '/RoadSensor.png';
		} else {
                    var outImg = L.Icon.Default.imagePath + '/generic.png';
                }
                var outIcon = L.icon({
                    iconUrl: outImg
                });
                event.target.setIcon(outIcon);
            }); 
            
            marker.on('click', function(event) {
                event.target.unbindPopup();
                var newpopup = null;
                var popupText, realTimeData, measuredTime, rtDataAgeSec, targetWidgets, color1, color2 = null;
                var urlToCall, fake, fakeId = null;
                $('html').addClass("wait");

                var eventTarget = event.target;
               
                
                urlToCall = "https://servicemap.disit.org/WebAppGrafo/api/v1/?serviceUri=" + p.tooltip + "&format=json";
                fake = false;
            //    }
                
                var latLngId = event.target.getLatLng().lat + "" + event.target.getLatLng().lng;
                latLngId = latLngId.replace(".", "");
                latLngId = latLngId.replace(".", "");//Incomprensibile il motivo ma con l'espressione regolare /./g non funziona
                
           //     $('.modal').show();
            //    $(document.body).css({'cursor' : 'wait'});

                $.ajax({
                    url: urlToCall,
                    type: "GET",
                    data: {},
                    async: true,
                    dataType: 'json',
                    success: function(geoJsonServiceData) 
                    {
                        var fatherNode = null;
                        //console.log(JSON.stringify(geoJsonServiceData));
                        if(geoJsonServiceData.hasOwnProperty("BusStop"))
                        {
                            fatherNode = geoJsonServiceData.BusStop;
                        }
                        else
                        {
                            if(geoJsonServiceData.hasOwnProperty("Sensor"))
                            {
                                fatherNode = geoJsonServiceData.Sensor;
                            }
                            else
                            {
                                //Prevedi anche la gestione del caso in cui non c'è nessuna di queste tre, sennò il widget rimane appeso.
                                fatherNode = geoJsonServiceData.Service;
                            }
                        }
                        
                        var serviceProperties = fatherNode.features[0].properties;
                        var underscoreIndex = serviceProperties.serviceType.indexOf("_");
                        var serviceClass = serviceProperties.serviceType.substr(0, underscoreIndex);
                        var serviceSubclass = serviceProperties.serviceType.substr(underscoreIndex);
                        serviceSubclass = serviceSubclass.replace(/_/g, " ");
                        
                        if (p.tooltip == 'undefined') {
                            color1 = '#ff6666';
                            color2 = '#ffcccc';
                        } else if (p.tooltip.indexOf('eCharging') !== -1) {
                            color1 = '#ff6666';
                            color2 = '#ffcccc';
                        } else if (p.tooltip.indexOf('BikeRack') !== -1) {
                            color1 = '#ff9900';
                            color2 = '#ffe0b3';
                        } else if (p.tooltip.indexOf('SensoreViaBolognese') !== -1) {
                            color1 = '#00e6e6';
                            color2 = '#99ffff';
                        } else if (p.tooltip.indexOf('smartwaste') !== -1) {
                            color1 = '#ff6666';
                            color2 = '#ffcccc';
                        } else if (p.tooltip.indexOf('smartbench') !== -1) {
                            color1 = '#ffdb4d';
                            color2 = '#fff5cc';
                        } else if (p.tooltip.indexOf('CarPark') !== -1) {
                            color1 = '#ff6666';
                            color2 = '#ffcccc';
                        } else {
                            color1 = '#ff6666';
                            color2 = '#ffcccc';
                        }
                        
                        
                        //Popup nuovo stile uguali a quelli degli eventi ricreativi
                        popupText = '<h3 class="recreativeEventMapTitle" style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">' + serviceProperties.name + '</h3>';
                        popupText += '<div class="recreativeEventMapBtnContainer"><button data-id="' + latLngId + '" class="recreativeEventMapDetailsBtn recreativeEventMapBtn recreativeEventMapBtnActive" type="button" style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">Details</button><button data-id="' + latLngId + '" class="recreativeEventMapDescriptionBtn recreativeEventMapBtn" type="button" style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">Description</button><button data-id="' + latLngId + '" class="recreativeEventMapContactsBtn recreativeEventMapBtn" type="button" style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">RT data</button></div>';

                        popupText += '<div class="recreativeEventMapDataContainer recreativeEventMapDetailsContainer">';
                        
                        popupText += '<table id="' + latLngId + '" class="gisPopupGeneralDataTable">';
                        //Intestazione
                        popupText += '<thead>';
                        popupText += '<th style="background: ' + color2 + '">Description</th>';
                        popupText += '<th style="background: ' + color2 + '">Value</th>';
                        popupText += '</thead>';

                        //Corpo
                        popupText += '<tbody>';
                        
                        if(serviceProperties.hasOwnProperty('website'))
                        {
                            if((serviceProperties.website !== '')&&(serviceProperties.website !== undefined)&&(serviceProperties.website !== 'undefined')&&(serviceProperties.website !== null)&&(serviceProperties.website !== 'null'))
                            {
                                if(serviceProperties.website.includes('http')||serviceProperties.website.includes('https'))
                                {
                                    popupText += '<tr><td>Website</td><td><a href="' + serviceProperties.website + '" target="_blank">Link</a></td></tr>';
                                }
                                else
                                {
                                    popupText += '<tr><td>Website</td><td><a href="' + serviceProperties.website + '" target="_blank">Link</a></td></tr>';
                                }
                            }
                            else
                            {
                                popupText += '<tr><td>Website</td><td>-</td></tr>';
                            }
                        }
                        else
                        {
                            popupText += '<tr><td>Website</td><td>-</td></tr>';
                        }
                        
                        if(serviceProperties.hasOwnProperty('email'))
                        {
                            if((serviceProperties.email !== '')&&(serviceProperties.email !== undefined)&&(serviceProperties.email !== 'undefined')&&(serviceProperties.email !== null)&&(serviceProperties.email !== 'null'))
                            {
                                popupText += '<tr><td>E-Mail</td><td>' + serviceProperties.email + '<td></tr>';
                            }
                            else
                            {
                                popupText += '<tr><td>E-Mail</td><td>-</td></tr>';
                            }
                        }
                        else
                        {
                            popupText += '<tr><td>E-Mail</td><td>-</td></tr>';
                        }
                        
                        if(serviceProperties.hasOwnProperty('address'))
                        {
                            if((serviceProperties.address !== '')&&(serviceProperties.address !== undefined)&&(serviceProperties.address !== 'undefined')&&(serviceProperties.address !== null)&&(serviceProperties.address !== 'null'))
                            {
                                popupText += '<tr><td>Address</td><td>' + serviceProperties.address + '</td></tr>';
                            }
                            else
                            {
                                popupText += '<tr><td>Address</td><td>-</td></tr>';
                            }
                        }
                        else
                        {
                            popupText += '<tr><td>Address</td><td>-</td></tr>';
                        }
                        
                        if(serviceProperties.hasOwnProperty('civic'))
                        {
                            if((serviceProperties.civic !== '')&&(serviceProperties.civic !== undefined)&&(serviceProperties.civic !== 'undefined')&&(serviceProperties.civic !== null)&&(serviceProperties.civic !== 'null'))
                            {
                                popupText += '<tr><td>Civic n.</td><td>' + serviceProperties.civic + '</td></tr>';
                            }
                            else
                            {
                                popupText += '<tr><td>Civic n.</td><td>-</td></tr>';
                            }
                        }
                        else
                        {
                            popupText += '<tr><td>Civic n.</td><td>-</td></tr>';
                        }
                        
                        if(serviceProperties.hasOwnProperty('cap'))
                        {
                            if((serviceProperties.cap !== '')&&(serviceProperties.cap !== undefined)&&(serviceProperties.cap !== 'undefined')&&(serviceProperties.cap !== null)&&(serviceProperties.cap !== 'null'))
                            {
                                popupText += '<tr><td>C.A.P.</td><td>' + serviceProperties.cap + '</td></tr>';
                            }
                        }
                        
                        if(serviceProperties.hasOwnProperty('city'))
                        {
                            if((serviceProperties.city !== '')&&(serviceProperties.city !== undefined)&&(serviceProperties.city !== 'undefined')&&(serviceProperties.city !== null)&&(serviceProperties.city !== 'null'))
                            {
                                popupText += '<tr><td>City</td><td>' + serviceProperties.city + '</td></tr>';
                            }
                            else
                            {
                                popupText += '<tr><td>City</td><td>-</td></tr>';
                            }
                        }
                        else
                        {
                            popupText += '<tr><td>City</td><td>-</td></tr>';
                        }
                        
                        if(serviceProperties.hasOwnProperty('province'))
                        {
                            if((serviceProperties.province !== '')&&(serviceProperties.province !== undefined)&&(serviceProperties.province !== 'undefined')&&(serviceProperties.province !== null)&&(serviceProperties.province !== 'null'))
                            {
                                popupText += '<tr><td>Province</td><td>' + serviceProperties.province + '</td></tr>';
                            }
                        }
                        
                        if(serviceProperties.hasOwnProperty('phone'))
                        {
                            if((serviceProperties.phone !== '')&&(serviceProperties.phone !== undefined)&&(serviceProperties.phone !== 'undefined')&&(serviceProperties.phone !== null)&&(serviceProperties.phone !== 'null'))
                            {
                                popupText += '<tr><td>Phone</td><td>' + serviceProperties.phone + '</td></tr>';
                            }
                            else
                            {
                                popupText += '<tr><td>Phone</td><td>-</td></tr>';
                            }
                        }
                        else
                        {
                            popupText += '<tr><td>Phone</td><td>-</td></tr>';
                        }
                        
                        if(serviceProperties.hasOwnProperty('fax'))
                        {
                            if((serviceProperties.fax !== '')&&(serviceProperties.fax !== undefined)&&(serviceProperties.fax !== 'undefined')&&(serviceProperties.fax !== null)&&(serviceProperties.fax !== 'null'))
                            {
                                popupText += '<tr><td>Fax</td><td>' + serviceProperties.fax + '</td></tr>';
                            }
                        }
                        
                        if(serviceProperties.hasOwnProperty('note'))
                        {
                            if((serviceProperties.note !== '')&&(serviceProperties.note !== undefined)&&(serviceProperties.note !== 'undefined')&&(serviceProperties.note !== null)&&(serviceProperties.note !== 'null'))
                            {
                                popupText += '<tr><td>Notes</td><td>' + serviceProperties.note + '</td></tr>';
                            }
                        }
                        
                        if(serviceProperties.hasOwnProperty('agency'))
                        {
                            if((serviceProperties.agency !== '')&&(serviceProperties.agency !== undefined)&&(serviceProperties.agency !== 'undefined')&&(serviceProperties.agency !== null)&&(serviceProperties.agency !== 'null'))
                            {
                                popupText += '<tr><td>Agency</td><td>' + serviceProperties.agency + '</td></tr>';
                            }
                        }
                        
                        if(serviceProperties.hasOwnProperty('code'))
                        {
                            if((serviceProperties.code !== '')&&(serviceProperties.code !== undefined)&&(serviceProperties.code !== 'undefined')&&(serviceProperties.code !== null)&&(serviceProperties.code !== 'null'))
                            {
                                popupText += '<tr><td>Code</td><td>' + serviceProperties.code + '</td></tr>';
                            }
                        }
                        
                        popupText += '</tbody>';
                        popupText += '</table>';
                        
                        if(geoJsonServiceData.hasOwnProperty('busLines'))
                        {
                            if(geoJsonServiceData.busLines.results.bindings.length > 0)
                            {
                                popupText += '<b>Lines: </b>';
                                for(var i = 0; i < geoJsonServiceData.busLines.results.bindings.length; i++)
                                {
                                   popupText += '<span style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">' + geoJsonServiceData.busLines.results.bindings[i].busLine.value + '</span> ';     
                                }
                            }
                        }
                        
                        popupText += '</div>';
                        
                        popupText += '<div class="recreativeEventMapDataContainer recreativeEventMapDescContainer">';
                        
                        if(serviceProperties.hasOwnProperty('description'))
                        {
                            if((serviceProperties.description !== '')&&(serviceProperties.description !== undefined)&&(serviceProperties.description !== 'undefined')&&(serviceProperties.description !== null)&&(serviceProperties.description !== 'null'))
                            {
                                popupText += serviceProperties.description + "<br>";
                            }
                            else
                            {
                                popupText += "No description available";
                            }
                        }
                        else
                        {
                            popupText += 'No description available';
                        }
                        
                        popupText += '</div>';
                        
                        popupText += '<div class="recreativeEventMapDataContainer recreativeEventMapContactsContainer">';
                        
                        var hasRealTime = false;
                        
                        if(geoJsonServiceData.hasOwnProperty("realtime"))
                        {
                            if(!jQuery.isEmptyObject(geoJsonServiceData.realtime))
                            {
                                realTimeData = geoJsonServiceData.realtime;
                                
                                console.log(realTimeData);
                                
                                popupText += '<div class="popupLastUpdateContainer centerWithFlex"><b>Last update:&nbsp;</b><span class="popupLastUpdate" data-id="' + latLngId + '"></span></div>';
                                

                                    //Tabella nuovo stile
                                    popupText += '<table id="' + latLngId + '" class="gisPopupTable">';

                                    //Intestazione
                                    popupText += '<thead>';
                                    popupText += '<th style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">Description</th>';
                                    popupText += '<th style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">Value</th>';
                                    popupText += '<th colspan="5" style="background: ' + color1 + '; background: -webkit-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -o-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: -moz-linear-gradient(right, ' + color1 + ', ' + color2 + '); background: linear-gradient(to right, ' + color1 + ', ' + color2 + ');">Buttons</th>';
                                    popupText += '</thead>';

                                    //Corpo
                                    popupText += '<tbody>';
                                    var dataDesc, dataVal, dataLastBtn, data4HBtn, dataDayBtn, data7DayBtn, data30DayBtn = null;
                                    for(var i = 0; i < realTimeData.head.vars.length; i++)
                                    {
                                        if((realTimeData.results.bindings[0][realTimeData.head.vars[i]].value.trim() !== '')&&(realTimeData.head.vars[i] !== null)&&(realTimeData.head.vars[i] !== 'undefined'))
                                        {
                                            if((realTimeData.head.vars[i] !== 'updating')&&(realTimeData.head.vars[i] !== 'measuredTime')&&(realTimeData.head.vars[i] !== 'instantTime'))
                                            {
                                                if(!realTimeData.results.bindings[0][realTimeData.head.vars[i]].value.includes('Not Available'))
                                                {
                                                    //realTimeData.results.bindings[0][realTimeData.head.vars[i]].value = '-';
                                                    dataDesc = realTimeData.head.vars[i].replace(/([A-Z])/g, ' $1').replace(/^./, function(str){ return str.toUpperCase(); });
                                                    dataVal = realTimeData.results.bindings[0][realTimeData.head.vars[i]].value;
                                                    dataLastBtn = '<td><button data-id="' + latLngId + '" type="button" class="lastValueBtn btn btn-sm" data-fake="' + fake + '" data-fakeid="' + fakeId + '" data-id="' + latLngId + '" data-field="' + realTimeData.head.vars[i] + '" data-serviceUri="' + p.tooltip + '" data-lastDataClicked="false" data-targetWidgets="' + targetWidgets + '" data-lastValue="' + realTimeData.results.bindings[0][realTimeData.head.vars[i]].value + '" data-color1="' + color1 + '" data-color2="' + color2 + '">Last<br>value</button></td>';
                                                    data4HBtn = '<td><button data-id="' + latLngId + '" type="button" class="timeTrendBtn btn btn-sm" data-fake="' + fake + '" data-fakeid="' + fakeId + '" data-id="' + latLngId + '" data-field="' + realTimeData.head.vars[i] + '" data-serviceUri="' + p.tooltip + '" data-timeTrendClicked="false" data-range-shown="4 Hours" data-range="4/HOUR" data-targetWidgets="' + targetWidgets + '" data-color1="' + color1 + '" data-color2="' + color2 + '">Last<br>4 hours</button></td>';
                                                    dataDayBtn = '<td><button data-id="' + latLngId + '" type="button" class="timeTrendBtn btn btn-sm" data-fake="' + fake + '" data-id="' + fakeId + '" data-field="' + realTimeData.head.vars[i] + '" data-serviceUri="' + p.tooltip + '" data-timeTrendClicked="false" data-range-shown="Day" data-range="1/DAY" data-targetWidgets="' + targetWidgets + '" data-color1="' + color1 + '" data-color2="' + color2 + '">Last<br>24 hours</button></td>';
                                                    data7DayBtn = '<td><button data-id="' + latLngId + '" type="button" class="timeTrendBtn btn btn-sm" data-fake="' + fake + '" data-id="' + fakeId + '" data-field="' + realTimeData.head.vars[i] + '" data-serviceUri="' + p.tooltip + '" data-timeTrendClicked="false" data-range-shown="7 days" data-range="7/DAY" data-targetWidgets="' + targetWidgets + '" data-color1="' + color1 + '" data-color2="' + color2 + '">Last<br>7 days</button></td>';
                                                    data30DayBtn = '<td><button data-id="' + latLngId + '" type="button" class="timeTrendBtn btn btn-sm" data-fake="' + fake + '" data-id="' + fakeId + '" data-field="' + realTimeData.head.vars[i] + '" data-serviceUri="' + p.tooltip + '" data-timeTrendClicked="false" data-range-shown="30 days" data-range="30/DAY" data-targetWidgets="' + targetWidgets + '" data-color1="' + color1 + '" data-color2="' + color2 + '">Last<br>30 days</button></td>';
                                                    popupText += '<tr><td>' + dataDesc + '</td><td>' + dataVal + '</td>' + dataLastBtn + data4HBtn + dataDayBtn + data7DayBtn + data30DayBtn + '</tr>';
                                                }
                                            }
                                            else
                                            {
                                                measuredTime = realTimeData.results.bindings[0][realTimeData.head.vars[i]].value.replace("T", " ");
                                                var now = new Date();
                                                var measuredTimeDate = new Date(measuredTime);
                                                rtDataAgeSec = Math.abs(now - measuredTimeDate)/1000;
                                            }
                                        }
                                    }
                                    popupText += '</tbody>';
                                    popupText += '</table>';
                                    popupText += '<p><b>Keep data on target widget(s) after popup close: </b><input data-id="' + latLngId + '" type="checkbox" class="gisPopupKeepDataCheck" data-keepData="false"/></p>'; 
                            //    }
                                
                                hasRealTime = true;
                            }
                        }
                        
                        popupText += '</div>'; 
                        
                        newpopup = L.popup({
                            closeOnClick: false,//Non lo levare, sennò autoclose:false non funziona
                            autoClose: false,
                            offset: [15, 0], 
                            minWidth: 435, 
                            maxWidth : 435
                        }).setContent(popupText);
                     //   }).setContent('PROVA POPUP !!!');
                        
                        eventTarget.bindPopup(newpopup).openPopup();  
                                                                
                    /*    event.target.bindPopup(popupText, {
                            offset: [15, 0], 
                            minWidth: 435, 
                            maxWidth : 435
                        }).openPopup(); */
                        
                        if(hasRealTime)
                        {
                            $('button.recreativeEventMapContactsBtn[data-id="' + latLngId + '"]').show();
                            $('button.recreativeEventMapContactsBtn[data-id="' + latLngId + '"]').trigger("click");
                            $('span.popupLastUpdate[data-id="' + latLngId + '"]').html(measuredTime);
                        }
                        else
                        {
                            $('button.recreativeEventMapContactsBtn[data-id="' + latLngId + '"]').hide();
                        }
                        
                        $('button.recreativeEventMapDetailsBtn[data-id="' + latLngId + '"]').off('click');
                        $('button.recreativeEventMapDetailsBtn[data-id="' + latLngId + '"]').click(function(){
                            $('div.recreativeEventMapDataContainer').hide();
                            $('div.recreativeEventMapDetailsContainer').show();
                            $('button.recreativeEventMapBtn').removeClass('recreativeEventMapBtnActive');
                            $(this).addClass('recreativeEventMapBtnActive');
                            
                    // $(this).parents('div[ng-controller="smartcitymap"]')
                            
                        /*    $('#' + widgetName + '_gisMapDiv div.recreativeEventMapDataContainer').hide();
                            $('#' + widgetName + '_gisMapDiv div.recreativeEventMapDetailsContainer').show();
                            $('#' + widgetName + '_gisMapDiv button.recreativeEventMapBtn').removeClass('recreativeEventMapBtnActive');
                            $(this).addClass('recreativeEventMapBtnActive');    */
                        });
                        
                        $('button.recreativeEventMapDescriptionBtn[data-id="' + latLngId + '"]').off('click');
                        $('button.recreativeEventMapDescriptionBtn[data-id="' + latLngId + '"]').click(function(){
                            $('div.recreativeEventMapDataContainer').hide();
                            $('div.recreativeEventMapDescContainer').show();
                            $('button.recreativeEventMapBtn').removeClass('recreativeEventMapBtnActive');
                            $(this).addClass('recreativeEventMapBtnActive');
                        /*    $('#' + widgetName + '_gisMapDiv div.recreativeEventMapDataContainer').hide();
                            $('#' + widgetName + '_gisMapDiv div.recreativeEventMapDescContainer').show();
                            $('#' + widgetName + '_gisMapDiv button.recreativeEventMapBtn').removeClass('recreativeEventMapBtnActive');
                            $(this).addClass('recreativeEventMapBtnActive');    */
                        });

                        $('button.recreativeEventMapContactsBtn[data-id="' + latLngId + '"]').off('click');
                        $('button.recreativeEventMapContactsBtn[data-id="' + latLngId + '"]').click(function(){
                            $('div.recreativeEventMapDataContainer').hide();
                            $('div.recreativeEventMapContactsContainer').show();
                            $('button.recreativeEventMapBtn').removeClass('recreativeEventMapBtnActive');
                            $(this).addClass('recreativeEventMapBtnActive');
                        /*    $('#' + widgetName + '_gisMapDiv div.recreativeEventMapDataContainer').hide();
                            $('#' + widgetName + '_gisMapDiv div.recreativeEventMapContactsContainer').show();
                            $('#' + widgetName + '_gisMapDiv button.recreativeEventMapBtn').removeClass('recreativeEventMapBtnActive');
                            $(this).addClass('recreativeEventMapBtnActive');    */
                           
                        }); 
                        
                     /*   if(hasRealTime)
                        {
                            $('button.recreativeEventMapContactsBtn[data-id="' + latLngId + '"]').trigger("click");
                        }   */
                        
                        $('table.gisPopupTable[id="' + latLngId + '"] button.btn-sm').css("background", color2);
                        $('table.gisPopupTable[id="' + latLngId + '"] button.btn-sm').css("border", "none");
                        $('table.gisPopupTable[id="' + latLngId + '"] button.btn-sm').css("color", "black");

                        $('table.gisPopupTable[id="' + latLngId + '"] button.btn-sm').focus(function(){
                            $(this).css("outline", "0");
                        });
                        
                        $('input.gisPopupKeepDataCheck[data-id="' + latLngId + '"]').off('click');
                        $('input.gisPopupKeepDataCheck[data-id="' + latLngId + '"]').click(function(){
                            if($(this).attr("data-keepData") === "false")
                            {
                               $(this).attr("data-keepData", "true"); 
                            }
                            else
                            {
                               $(this).attr("data-keepData", "false"); 
                            }
                        });

                        $('button.lastValueBtn').off('mouseenter');
                        $('button.lastValueBtn').off('mouseleave');
                        $('button.lastValueBtn[data-id="' + latLngId + '"]').hover(function(){
                            if($(this).attr("data-lastDataClicked") === "false")
                            {
                                $(this).css("background", color1);
                                $(this).css("background", "-webkit-linear-gradient(left, " + color1 + ", " + color2 + ")");
                                $(this).css("background", "background: -o-linear-gradient(left, " + color1 + ", " + color2 + ")");
                                $(this).css("background", "background: -moz-linear-gradient(left, " + color1 + ", " + color2 + ")");
                                $(this).css("background", "background: linear-gradient(to left, " + color1 + ", " + color2 + ")");
                                $(this).css("font-weight", "bold");
                            }

                        //    var widgetTargetList = $(this).attr("data-targetWidgets").split(',');
                            var widgetTargetList = "timeTrend";
                        
                            var colIndex = $(this).parent().index();
                            //var title = $(this).parents("tbody").find("tr").eq(0).find("th").eq(colIndex).html();
                            var title = $(this).parents("tr").find("td").eq(0).html();

                        //    for(var i = 0; i < widgetTargetList.length; i++)
                        //    {
                                $.event.trigger({
                                 //   type: "mouseOverLastDataFromExternalContentGis_" + widgetTargetList[i],
                                    type: "mouseOverLastDataFromExternalContentGis_timeTrend" + widgetTargetList,
                                    eventGenerator: $(this),
                                //    targetWidget: widgetTargetList[i],
                                    targetWidget: widgetTargetList,
                                    targetWidget: "timeTrend",
                                    value: $(this).attr("data-lastValue"),
                                    color1: $(this).attr("data-color1"),
                                    color2: $(this).attr("data-color2"),
                                    widgetTitle: title
                                }); 
                        //    }
                        }, 
                        function(){
                            if($(this).attr("data-lastDataClicked")=== "false")
                            {
                                $(this).css("background", color2);
                                $(this).css("font-weight", "normal"); 
                            }
                        //    var widgetTargetList = $(this).attr("data-targetWidgets").split(',');
                            var widgetTargetList = "timeTrend";

                        //    for(var i = 0; i < widgetTargetList.length; i++)
                        //    {
                                $.event.trigger({
                                  //  type: "mouseOutLastDataFromExternalContentGis_" + widgetTargetList[i],
                                    type: "mouseOutLastDataFromExternalContentGis_" + widgetTargetList,
                                    eventGenerator: $(this),
                                    targetWidget: widgetTargetList,
                                //    targetWidget: widgetTargetList[i],
                                    value: $(this).attr("data-lastValue"),
                                    color1: $(this).attr("data-color1"),
                                    color2: $(this).attr("data-color2")
                                }); 
                         //   }
                        });
                        
                        //Disabilitiamo i 4Hours se last update più vecchio di 4 ore
                        if(rtDataAgeSec > 14400)
                        {
                            $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="4/HOUR"]').attr("data-disabled", "true");
                            //Disabilitiamo i 24Hours se last update più vecchio di 24 ore
                            if(rtDataAgeSec > 86400)
                            {
                                $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="1/DAY"]').attr("data-disabled", "true");
                                //Disabilitiamo i 7 days se last update più vecchio di 7 days
                                if(rtDataAgeSec > 604800)
                                {
                                    $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="7/DAY"]').attr("data-disabled", "true");
                                    //Disabilitiamo i 30 days se last update più vecchio di 30 days
                                    if(rtDataAgeSec > 18144000)
                                    {
                                       $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="30/DAY"]').attr("data-disabled", "true");
                                    }
                                    else
                                    {
                                        $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="30/DAY"]').attr("data-disabled", "false");
                                    }
                                }
                                else
                                {
                                    $('#timeTrend_modalLinkOpen button.timeTrendBtn[data-id="' + latLngId + '"][data-range="7/DAY"]').attr("data-disabled", "false");
                                }
                            }
                            else
                            {
                                $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="1/DAY"]').attr("data-disabled", "false");
                            }
                        }
                        else
                        {
                            $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="4/HOUR"]').attr("data-disabled", "false");
                            $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="1/DAY"]').attr("data-disabled", "false");
                            $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="7/DAY"]').attr("data-disabled", "false");
                            $('button.timeTrendBtn[data-id="' + latLngId + '"][data-range="30/DAY"]').attr("data-disabled", "false");
                        }

                        $('button.timeTrendBtn').off('mouseenter');
                        $('button.timeTrendBtn').off('mouseleave');
                        $('button.timeTrendBtn[data-id="' + latLngId + '"]').hover(function(){
                            if(isNaN(parseFloat($(this).parents('tr').find('td').eq(1).html()))||($(this).attr("data-disabled") === "true"))
                            {
                                $(this).css("background-color", "#e6e6e6");
                                $(this).off("hover");
                                $(this).off("click");
                            }
                            else
                            {
                                if($(this).attr("data-timeTrendClicked") === "false")
                                {
                                    $(this).css("background", color1);
                                    $(this).css("background", "-webkit-linear-gradient(left, " + color1 + ", " + color2 + ")");
                                    $(this).css("background", "background: -o-linear-gradient(left, " + color1 + ", " + color2 + ")");
                                    $(this).css("background", "background: -moz-linear-gradient(left, " + color1 + ", " + color2 + ")");
                                    $(this).css("background", "background: linear-gradient(to left, " + color1 + ", " + color2 + ")");
                                    $(this).css("font-weight", "bold");
                                }

                            //    var widgetTargetList = $(this).attr("data-targetWidgets").split(',');
                                var widgetTargetList = "timeTrend";
                                
                                //var colIndex = $(this).parent().index();
                                //var title = $(this).parents("tbody").find("tr").eq(0).find("th").eq(colIndex).html() + " - " + $(this).attr("data-range-shown");
                                var title = $(this).parents("tr").find("td").eq(0).html() + " - " + $(this).attr("data-range-shown");

                             //   for(var i = 0; i < widgetTargetList.length; i++)
                             //   {
                                    $.event.trigger({
                                      //  type: "mouseOverTimeTrendFromExternalContentGis_" + widgetTargetList[i],
                                        type: "mouseOverTimeTrendFromExternalContentGis_" + widgetTargetList,
                                        eventGenerator: $(this),
                                     //   targetWidget: widgetTargetList[i],
                                        targetWidget: widgetTargetList,
                                        value: $(this).attr("data-lastValue"),
                                        color1: $(this).attr("data-color1"),
                                        color2: $(this).attr("data-color2"),
                                        widgetTitle: title
                                    }); 
                             //   }
                            }
                        }, 
                        function(){
                            if(isNaN(parseFloat($(this).parents('tr').find('td').eq(1).html()))||($(this).attr("data-disabled") === "true"))
                            {
                                $(this).css("background-color", "#e6e6e6");
                                $(this).off("hover");
                                $(this).off("click");
                            }
                            else
                            {
                                if($(this).attr("data-timeTrendClicked")=== "false")
                                {
                                    $(this).css("background", color2);
                                    $(this).css("font-weight", "normal"); 
                                }

                             //   var widgetTargetList = $(this).attr("data-targetWidgets").split(',');
                                var widgetTargetList = "timeTrend";
                             
                            //    for(var i = 0; i < widgetTargetList.length; i++)
                            //    {
                                    $.event.trigger({
                                    //    type: "mouseOutTimeTrendFromExternalContentGis_" + widgetTargetList[i],
                                        type: "mouseOutTimeTrendFromExternalContentGis_" + widgetTargetList,
                                        eventGenerator: $(this),
                                      //  targetWidget: widgetTargetList[i],
                                        targetWidget: widgetTargetList,
                                        value: $(this).attr("data-lastValue"),
                                        color1: $(this).attr("data-color1"),
                                        color2: $(this).attr("data-color2")
                                    }); 
                             //   }
                            }
                        });

                        $('button.lastValueBtn[data-id=' + latLngId + ']').off('click');
                        $('button.lastValueBtn[data-id=' + latLngId + ']').click(function(event){
                            $('button.lastValueBtn').each(function(i){
                                $(this).css("background", $(this).attr("data-color2"));
                            });
                            $('button.lastValueBtn').css("font-weight", "normal");
                            $(this).css("background", $(this).attr("data-color1"));
                            $(this).css("font-weight", "bold");
                            $('button.lastValueBtn').attr("data-lastDataClicked", "false");
                            $(this).attr("data-lastDataClicked", "true");
                            
                        //    var widgetTargetList = $(this).attr("data-targetWidgets").split(',');
                            var widgetTargetList = "timeTrend";
                            
                            var colIndex = $(this).parent().index();
                            var title = $(this).parents("tr").find("td").eq(0).html();

                        //    for(var i = 0; i < widgetTargetList.length; i++)
                       //     {
                                $.event.trigger({
                                //    type: "showLastDataFromExternalContentGis_" + widgetTargetList[i],
                                    type: "showLastDataFromExternalContentGis_" + widgetTargetList,
                                    eventGenerator: $(this),
                                //    targetWidget: widgetTargetList[i],
                                    targetWidget: widgetTargetList,
                                    value: $(this).attr("data-lastValue"),
                                    color1: $(this).attr("data-color1"),
                                    color2: $(this).attr("data-color2"),
                                    widgetTitle: title,
                                    field: $(this).attr("data-field"),
                                    serviceUri: $(this).attr("data-serviceUri"),
                                //    marker: markersCache["" + $(this).attr("data-id") + ""],
                                    mapRef: map,
                                    fake: $(this).attr("data-fake"),
                                    fakeId: $(this).attr("data-fakeId")
                                });
                          //  }
                        });

                        $('button.timeTrendBtn').off('click');
                        $('button.timeTrendBtn').click(function(event){
                            if(isNaN(parseFloat($(this).parents('tr').find('td').eq(1).html()))||($(this).attr("data-disabled") === "true"))
                            {
                                $(this).css("background-color", "#e6e6e6");
                                $(this).off("hover");
                                $(this).off("click");
                            }
                            else
                            {
                                $('button.timeTrendBtn').css("background", $(this).attr("data-color2"));
                                $('button.timeTrendBtn').css("font-weight", "normal");
                                $(this).css("background", $(this).attr("data-color1"));
                                $(this).css("font-weight", "bold");
                                $('button.timeTrendBtn').attr("data-timeTrendClicked", "false");
                                $(this).attr("data-timeTrendClicked", "true");
                                
                            //    var widgetTargetList = $(this).attr("data-targetWidgets").split(',');
                                var widgetTargetList = "timeTrend";
                                
                                var colIndex = $(this).parent().index();
                                var title = $(this).parents("tr").find("td").eq(0).html() + " - " + $(this).attr("data-range-shown");
                                var lastUpdateTime = $(this).parents('div.recreativeEventMapContactsContainer').find('span.popupLastUpdate').html();

                                var now = new Date();
                                var lastUpdateDate = new Date(lastUpdateTime);
                                var diff = parseFloat(Math.abs(now-lastUpdateDate)/1000);
                                var range = $(this).attr("data-range");

                             //   for(var i = 0; i < widgetTargetList.length; i++)
                             //   {
                                    $.event.trigger({
                                        type: "showTimeTrendFromExternalContentGis_" + widgetTargetList,
                                     //   type: "showTimeTrendFromExternalContentGis_" + widgetTargetList[i],
                                        eventGenerator: $(this),
                                    //    targetWidget: widgetTargetList[i],
                                        targetWidget: widgetTargetList,
                                        range: range,
                                        color1: $(this).attr("data-color1"),
                                        color2: $(this).attr("data-color2"),
                                        widgetTitle: title,
                                        field: $(this).attr("data-field"),
                                        serviceUri: $(this).attr("data-serviceUri"),
                                    //    marker: markersCache["" + $(this).attr("data-id") + ""],
                                        mapRef: map,
                                        fake: false
                                        //fake: $(this).attr("data-fake")
                                    }); 
                             //   }
                            }
                        });
                        
                        $('button.timeTrendBtn[data-id="' + latLngId + '"]').each(function(i){
                            if(isNaN(parseFloat($(this).parents('tr').find('td').eq(1).html()))||($(this).attr("data-disabled") === "true"))
                            {
                                $(this).css("background-color", "#e6e6e6");
                                $(this).off("hover");
                                $(this).off("click");
                            }
                        });

                        map.off('popupclose');
                        map.on('popupclose', function(closeEvt) {
                            var popupContent = $('<div></div>');
                            popupContent.html(closeEvt.popup._content);
                            
                            if(popupContent.find("button.lastValueBtn").length > 0)
                            {
                             //   var widgetTargetList = popupContent.find("button.lastValueBtn").eq(0).attr("data-targetWidgets").split(',');
                                var widgetTargetList = "timeTrend";
                                
                                if(($('button.lastValueBtn[data-lastDataClicked=true]').length > 0)&&($('input.gisPopupKeepDataCheck').attr('data-keepData') === "false"))
                                {
                               //     for(var i = 0; i < widgetTargetList.length; i++)
                                 //   {
                                        $.event.trigger({
                                        //    type: "restoreOriginalLastDataFromExternalContentGis_" + widgetTargetList[i],
                                            type: "restoreOriginalLastDataFromExternalContentGis_" + widgetTargetList,
                                            eventGenerator: $(this),
                                        //    targetWidget: widgetTargetList[i],
                                            targetWidget: widgetTargetList,
                                            value: $(this).attr("data-lastValue"),
                                            color1: $(this).attr("data-color1"),
                                            color2: $(this).attr("data-color2")
                                        }); 
                                //    } 
                                }

                                if(($('button.timeTrendBtn[data-timeTrendClicked=true]').length > 0)&&($('input.gisPopupKeepDataCheck').attr('data-keepData') === "false"))
                                {
                                 //   for(var i = 0; i < widgetTargetList.length; i++)
                                 //   {
                                        $.event.trigger({
                                        //    type: "restoreOriginalTimeTrendFromExternalContentGis_" + widgetTargetList[i],
                                            type: "restoreOriginalTimeTrendFromExternalContentGis_" + widgetTargetList,
                                            eventGenerator: $(this),
                                            targetWidget: widgetTargetList
                                        }); 
                                 //   } 
                                } 
                            }
                        }); 

                    },
                    complete: function(){
                      //  $('.modal').hide();
                      //  $(document.body).css({'cursor' : 'default'});
                      $('html').removeClass("wait");
                    },
                    error: function(errorData)
                    {
                     //   $('html').removeClass("wait");
                     //   alert('No Data');
                        console.log("Error in data retrieval");
                        console.log(JSON.stringify(errorData));
                    /*    var serviceProperties = feature.properties;
                        
                        var underscoreIndex = serviceProperties.serviceType.indexOf("_");
                        var serviceClass = serviceProperties.serviceType.substr(0, underscoreIndex);
                        var serviceSubclass = serviceProperties.serviceType.substr(underscoreIndex);
                        serviceSubclass = serviceSubclass.replace(/_/g, " ");
                        
                        popupText = '<h3 class="gisPopupTitle">' + serviceProperties.name + '</h3>' +
                                    '<p><b>Typology: </b>' + serviceClass + " - " + serviceSubclass + '</p>' +
                                    '<p><i>Data are limited due to an issue in their retrieval</i></p>';    */
                        
                        var url = this.url;
                        var label = '';
                        if (url == 'https://servicemap.disit.org/WebAppGrafo/api/v1/?serviceUri=undefined&format=json') {
                            label = 'Node-Red Microservice';
                        } else {
                            var labell = url.split('https://servicemap.disit.org/WebAppGrafo/api/v1/?serviceUri=');
                            if (labell[1] != null) {
                                label = labell[1].split('&format=json')[0];
                            } else {
                                label = '';
                            }
                            
                        }
                        
                        popupText = '<h3 class="gisPopupTitle">' + label + '</h3>' +
                                    '<p><i>Tooltip is not a valid Km4City URI</i></p>' +
                                    '<p><i>No additional info</i></p>';
                            
                        eventTarget.bindPopup(popupText, {
                            offset: [15, 0], 
                            minWidth: 215, 
                            maxWidth : 600
                        }).openPopup();    
                    }
                });
                
                
            });  
            
            return marker;
        }
        
        
        function render_panel() {
          scope.require(['./leaflet/plugins'], function () {
            scope.panelMeta.loading = false;
            
            if (scope.experimental_flag == 1) {
                L.Icon.Default.imagePath = 'app/panels/smartcitymap/leaflet/images/gisMapIcons';
            } else {  
                L.Icon.Default.imagePath = 'app/panels/smartcitymap/leaflet/images';
            }
            if(_.isUndefined(map)) {
              map = L.map(attrs.id, {
                scrollWheelZoom: true,
                center: [40, -86],
                zoom: 10
              });

              // Add Change to the tile layer url, because it was returning 403 (forbidden)
              // Forbidden because of API Key in cloudmade, so I used osm for now
              // osm (open street map) (http://{s}.tile.osm.org/{z}/{x}/{y}.png)
              // cloud made (http://{s}.tile.cloudmade.com/57cbb6ca8cac418dbb1a402586df4528/22677/256/{z}/{x}/{y}.png)
              L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
                maxZoom: 18,
                minZoom: 2
              }).addTo(map);

            //  layerGroup = new L.MarkerClusterGroup({maxClusterRadius:50});
              layerGroup = new L.MarkerClusterGroup({maxClusterRadius:50, disableClusteringAtZoom: 13});   
           //  layerGroup = new L.FeatureGroup();  // DISABLE ICONs CLUSTERING
            } else {
              layerGroup.clearLayers();
            }

            _.each(scope.data, function(p) {
              if(!_.isUndefined(p.tooltip) && p.tooltip !== '') {
            //  if(!_.isUndefined(p.tooltip)) {
            //    p = prepareMarker(p);
                var marker_snap4city = prepareMarker(p);
             //   var marker_snap4city = new L.Marker(p.coordinates, {icon: markerIcon}).bindLabel(p.tooltip);
            //    layerGroup.addLayer(L.marker(p.coordinates).bindLabel(p.tooltip));
                layerGroup.addLayer(marker_snap4city.bindLabel(p.tooltip));
              } else {
            //    layerGroup.addLayer(L.marker(p.coordinates));
            
              /*  var marker_snap4city = prepareMarker(p);
                layerGroup.addLayer(marker_snap4city);  */
              }
            });

            layerGroup.addTo(map);

            if (scope.panel.fitBoundsAuto || fitBoundsFlag) {
              map.fitBounds(_.pluck(scope.data,'coordinates'));
              fitBoundsFlag = false;
            }
          });
        }
      }
    };
  });

});