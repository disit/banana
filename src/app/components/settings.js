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


define(['underscore'],
function (_) {
  "use strict";

  return function Settings (options) {
    /**
     * To add a setting, you MUST define a default. Also,
     * THESE ARE ONLY DEFAULTS.
     * They are overridden by config.js in the root directory
     * @type {Object}
     */
    var defaults = {
      solr: "http://"+window.location.hostname+":8983/solr/",
      solr_core: "logs",
      timefield: "timestamp_tdt",
      blacklist:[
	  "Dashboard1-rt",
	  "Developer Dashboard",
	  "AMMA Dashboard 1min Snap4City-30minview",
	  "AMMA Snap4City Full",
	  "Resource Dashboard",
	  "AMMA Snap4City",
	  "AMMA Tool Snap4City",
	  "ResDash Docker",
	  "Cloud Resource Manager Snap4City",
	  "Developer Dashboard New",
	  "Dashboard1-RT",
	  "Dashboard1",
	  "Sensors-ETL-IOT-v3",
 ],

//	blacklist:[],
      USE_ADMIN_LUKE: true,
      USE_ADMIN_CORES: true,
      panel_names: [],
      banana_index: "system_banana",

      // Lucidworks Fusion settings
      USE_FUSION: true,  
      apollo: "/api/apollo",
      apollo_queryPipeline: "/api/apollo/query-pipelines/",
      apollo_indexPipeline: "/api/apollo/index-pipelines/",

      SYSTEM_BANANA_QUERY_PIPELINE: "/api/apollo/query-pipelines/default/collections/system_banana",
      SYSTEM_BANANA_INDEX_PIPELINE: "/api/apollo/index-pipelines/_system/collections/system_banana",
      SYSTEM_BANANA_BLOB_API: "/api/apollo/blobs",
      SYSTEM_BANANA_BLOB_ID_SUBTYPE_PARAM: "resourceType=banana",  // for use when saving dashboards, to create metadata field resourceType=banana
      SYSTEM_BANANA_BLOB_ID_SUBTYPE_QUERY: "resourceType=banana",  // for use when searching dashboards in Blob Store

      FUSION_API_STATIC_FIELDS: "/schema/fields",
      FUSION_API_DYNAMIC_FIELDS: "/schema/dynamicfields",
      FUSION_API_COLLECTIONS: "/api/apollo/collections"
    };

    // This initializes a new hash on purpose, to avoid adding parameters to
    // config.js without providing sane defaults
    var settings = {};
    _.each(defaults, function(value, key) {
      settings[key] = typeof options[key] !== 'undefined' ? options[key]  : defaults[key];
    });

    return settings;
  };
});
