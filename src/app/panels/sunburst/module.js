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

 ## Sunburst Panel For Banana 1.5

 */
define([
    'angular',
    'app',
    'underscore',
    'jquery',
    'd3',
], function (angular, app, _, $, d3) {
    'use strict';

    var module = angular.module('kibana.panels.sunburst', []);
    app.useModule(module);

    module.controller('sunburst', function ($scope, dashboard, querySrv, filterSrv) {
        $scope.panelMeta = {
            modals: [{
                description: "Inspect",
                icon: "icon-info-sign",
                partial: "app/partials/inspector.html",
                show: $scope.panel.spyable
            }],
            editorTabs: [{
                title: 'Queries',
                src: 'app/partials/querySelect.html'
            }],
            status: "Experimental",
            description: "This panel generates a sunburst graphic based on solr Facet Pivots output. "
        };
        // default values
        var _d = {
            mode        : 'count',
            queries: {
                mode: 'all',
                ids: [],
                query: '*:*',
                custom: ''
            },
            facet_limit: 1000, // maximum number of rows returned from Solr
            value_field : null,
            spyable: true,
            show_queries: true,
        };

        _.defaults($scope.panel, _d);
        var DEBUG = true;

        $scope.init = function () {
            $scope.$on('refresh', function () {
                $scope.get_data();

            });
            $scope.get_data();
        };

        $scope.parse_facet_pivot = function (data) {
            var out = {'name': 'root', 'children': []};
            for (var ob in data) {
                out.children.push($scope.parse_item(data[ob]));
            }
            return out;
        };

        $scope.parse_item = function (doc) {
            var t = {'name': doc.value, 'size': doc.count, 'children': []};
            for (var piv in doc.pivot) {
                t.children.push($scope.parse_item(doc.pivot[piv]));
            }
            return t;
        };
        
        $scope.parse_facet_pivot_sum = function (data) {
            var out = {'name': 'root', 'children': []};
            for (var ob in data) {
                out.children.push($scope.parse_item_sum(data[ob]));
            }
            return out;
        };

        
        $scope.parse_item_sum = function (doc) {
            var t = {'name': doc.val, 'size': doc.payload, 'children': []};
            if (doc.pivot != null)  {
                for (var piv in doc.pivot.buckets) {
                 //   t.children.push($scope.parse_item_sum_inner(doc.pivot.buckets[piv]));
                    t.children.push($scope.parse_item_sum(doc.pivot.buckets[piv]));
                }
            } else {
                return t;
            }
            return t;
        };
        
         $scope.parse_item_sum_inner = function (doc) {
            var t = {'name': doc.val, 'size': doc.payload, 'children': []};
        //    for (var piv in doc.pivot.buckets) {
           //     t.push($scope.parse_item_sum_inner(doc));
                t['name'] = doc.val;
                t['size'] = doc.payload;
                t['children'] = [];
        //    }
            return t;
        };
        
        $scope.parse_item_sum2 = function (doc) {
            var t = {'name': doc.val, 'size': doc.payload, 'children': []};
            for (var piv in doc.pivot) {
                t.children.push($scope.parse_item_sum_inner2(doc.pivot[piv]));
            }
            return t;
        };
        
        $scope.parse_item_sum_inner2 = function (doc) {
            var t = {'name': doc.val, 'size': doc.payload, 'children': []};
            for (var piv in doc.buckets) {
                t.children.push($scope.parse_item_sum_inner2(doc));
           /*     t['name'] = doc.val;
                t['size'] = doc.payload;
                t['children'] = []; */
            }
            return t;
        };
        
        $scope.get_data = function () {
            // Show progress by displaying a spinning wheel icon on panel
            if($scope.panel.mode === 'sum(values)') {
          //      var $experimental_flag = 1;
                
                if (!$scope.panel.value_field) {
                    $scope.panel.error = "In " + $scope.panel.mode + " mode a field must be specified";
                    return;
                }
            } else {
         //       var $experimental_flag = 0;
            }
        //    $scope.experimental_flag = $experimental_flag;
            $scope.panelMeta.loading = true;
            delete $scope.panel.error;

            var request, results;
            // Set Solr server
            $scope.sjs.client.server(dashboard.current.solr.server + dashboard.current.solr.core_name);
            // -------------------- TODO: REMOVE ALL ELASTIC SEARCH AFTER FIXING SOLRJS --------------
            $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);
            // This could probably be changed to a BoolFilter
            var boolQuery = $scope.sjs.BoolQuery();
            _.each($scope.panel.queries.ids, function (id) {
                boolQuery = boolQuery.should(querySrv.getEjsObj(id));
            });
            request = $scope.sjs.Request().indices(dashboard.indices);
            request = request.query(
                $scope.sjs.FilteredQuery(
                    boolQuery,
                    filterSrv.getBoolFilter(filterSrv.ids)
                )); // Set the size of query result
            $scope.populate_modal(request);
            // --------------------- END OF ELASTIC SEARCH PART ---------------------------------------

            // Construct Solr query
            var fq = '';
            if (filterSrv.getSolrFq()) {
                fq = '&' + filterSrv.getSolrFq();
            }
            var wt_json = '&wt=json';
            var rows = '&rows=0';
            var facet = '&facet=true';
            var facet_pivot = '&facet.pivot=' + $scope.panel.facet_pivot_strings.join().replace(/ /g, '');
            var legend_fields_string = $scope.panel.facet_pivot_strings.join();
            var field_array = legend_fields_string.replace(/ /g, '').split(',')
            $scope.panel.legend_string = legend_fields_string;
            var facet_limits = '&facet.limit=' + $scope.panel.facet_limit;
            $scope.panel.queries.query = querySrv.getORquery() + fq + wt_json + facet + facet_pivot + facet_limits + rows;
            if (DEBUG) {
                console.log($scope.panel.queries.query);
            }
            // Set the additional custom query
            if ($scope.panel.queries.custom != null) {
                if ($scope.panel.mode === 'count') {
                    request = request.setQuery($scope.panel.queries.query + $scope.panel.queries.custom);
                } else {
                    var facet_limits = '&facet.limit=' + $scope.panel.facet_limit;
                    if (filterSrv.getSolrFq()) {
                        fq = '&' + filterSrv.getSolrFq();
                    }
                    var str = '';
                    for (var i = 0; i < field_array.length; i++) {
                        if (i != 0) {
                            if (i != field_array.length-1) {
                                str = str + ', pivot: { type : terms, field : ' + field_array[i] + ', facet : { payload : "sum('+ $scope.panel.value_field + ')"';
                            } else {
                                var close_brackets_str = '';
                                for (var n = 0; n < 2*(field_array.length); n++) {
                                    close_brackets_str = close_brackets_str + '}';
                                }
                                str = str + ', pivot: { type : terms, field : ' + field_array[i] + ', facet : { payload : "sum('+ $scope.panel.value_field + ')"' + close_brackets_str + '}&wt=json';
                            }    
                        } else {
                            str = '&json.facet={ pivot: { type : terms, field : ' + field_array[i] + ', facet : { payload : "sum('+ $scope.panel.value_field + ')"';
                        }
                    }
                    
                    var query_string = 'q=*:*&' + fq + str + facet_limits + rows;
                //    request = request.setQuery('q=*:*&' + fq + '&json.facet={%20pivot:{%20type%20:%20terms,%20field%20:%20ip_ext,%20facet%20:%20{%20payload%20:%20"sum(payload)",%20pivot:%20{%20type%20:%20terms,%20field%20:%20ip_local,%20facet%20:%20{%20payload%20:%20"sum(payload)"%20}}}%20}}&wt=json' + facet_limits);
                //    request = request.setQuery('q=*:*&' + fq + '&json.facet={pivot:{%20type%20:%20terms,%20field%20:%20ip_ext,%20facet%20:%20{%20payload%20:%20"sum(payload)",%20pivot:%20{type%20:%20terms,%20field%20:%20ip_local,%20facet%20:%20{%20payload%20:%20"sum(payload)",%20pivot:%20{type%20:%20terms,%20field%20:%20pid_local,%20facet%20:%20{%20payload%20:%20"sum(payload)"%20}}}}}%20}}&wt=json' + facet_limits);
                    request = request.setQuery(query_string);
                }
            } else {
                request = request.setQuery($scope.panel.queries.query);
            }

            // Execute the search and get results
            results = request.doSearch();
            results.then(function (results) {
                if ($scope.panel.mode === 'count') {
                    $scope.data = $scope.parse_facet_pivot(results.facet_counts.facet_pivot[$scope.panel.facet_pivot_strings.join().replace(/ /g, '')]);
                } else { 
                    $scope.data = $scope.parse_facet_pivot_sum(results.facets.pivot.buckets);
                }
                console.log($scope.data);
                $scope.render();
            });


        };

        $scope.dash = dashboard;
        $scope.set_refresh = function (state) {
            $scope.refresh = state;
        };

        $scope.close_edit = function () {
            if ($scope.refresh) {
                $scope.get_data();
            }
            $scope.refresh = false;
            $scope.$emit('render');
        };

        $scope.render = function () {
            $scope.$emit('render');
        };

        $scope.populate_modal = function (request) {
            $scope.inspector = angular.toJson(JSON.parse(request.toString()), true);
        };

        $scope.pad = function (n) {
            return (n < 10 ? '0' : '') + n;
        };

        $scope.set_filters = function (d) {
            if (DEBUG) {
                console.log("Setting Filters to " + d);
            }
            for (var i = 0; i < d.length; i++) {
                filterSrv.set({
                    type: 'terms',
                    field: $scope.panel.facet_pivot_strings[i].replace(/ /g, ''),
                    mandate: 'must',
                    value: d[i]
                });
                console.log($scope.panel.facet_pivot_strings[i].replace(/ /g, '') + ' - ' + d[i]);

            }

            dashboard.refresh();
        };

    });

    module.directive('sunburst', function () {
        return {
            terminal: true,
            restrict: 'E',
            link: function (scope, element/*,attrs*/) { // attrs is never used
                scope.$on('render', function () {
                    console.log("Sending SunBurzt 'render' Emit");

                    render_panel();
                });

                angular.element(window).bind('resize', function () {
                    render_panel();
                });

                function render_panel() {
                    var DEBUG = true;
                    if (DEBUG) {
                        console.log("Starting to Render Sunburst");
                        console.log(scope.data);
                    }

                    function click(d) {
                        var parents = getAncestors(d);
                        var out = parents.map(function (a) {
                            return a.name;
                        });
                        scope.set_filters(out);
                    }

                    function stash(d) {
                        d.x0 = d.x;
                        d.dx0 = d.dx;
                    }

                    function mouseover(d) {
                        var parents = getAncestors(d);

                        d3.selectAll("path")
                            .style("opacity", 0.3);

                        d3.selectAll("path")
                            .filter(function (node) {
                                return (parents.indexOf(node) >= 0);
                            })
                            .style("opacity", 1);
                        if (scope.panel.mode === 'count') {
                            $tooltip
                                .html(d['name'] + ' (' + scope.dash.numberWithCommas(d['size']) + ')')
                                .place_tt(d3.event.pageX, d3.event.pageY);
                        } else {
                            var $after_comma_val = scope.dash.numberWithCommas(d['size']).substring(scope.dash.numberWithCommas(d['size']).indexOf('.'), scope.dash.numberWithCommas(d['size']).indexOf('.')+5).replace(',', '');
                            var $float_val = scope.dash.numberWithCommas(d['size']).substring(0,scope.dash.numberWithCommas(d['size']).indexOf('.')) + $after_comma_val;                           
                            $tooltip
                                .html(d['name'] + ' (' + $float_val + ')')
                                .place_tt(d3.event.pageX, d3.event.pageY);
                        }
                    }

                    // Restore everything to full opacity when moving off the visualization.
                    function mouseleave() {
                        d3.selectAll("path")
                            .style("opacity", 1);
                        $tooltip.detach();
                    }

                    function getAncestors(node) {
                        var path = [];
                        var current = node;
                        while (current.parent) {
                            path.unshift(current);
                            current = current.parent;
                        }
                        return path;
                    }

                    element.html("");
                    var el = element[0];
                    var parent_width = element.parent().width(),
                        height = parseInt(scope.row.height);
                    var margin = {
                            top: 30,
                            right: 20,
                            bottom: 10,
                            left: 20
                        },
                        width = parent_width - margin.left - margin.right;

                    d3.selectAll("#sunbursttooltip").remove();
                    height = height - margin.top - margin.bottom;

                    var color = d3.scale.category20c();
                    var radius = Math.min(width, height) / 2;
                    var svg = d3.select(el)     /* PANTALEO */
                    //    .html("<div id=\"vv\"><h2>Sunbusrt Chart</h2>").style("font", "14px 'Helvetica Neue'")
                        .append("text")
                        .attr("x", 20)
                        .attr("y", 20)
                        .attr("transform", "translate(20,20) rotate(-90)")
                    //    .text("Sunburst Chart")
                        .append("svg")
                        .attr("style","height:"+height+"px;width:"+width+"px")
                        .append("g")
                        .attr("transform", "translate(" + width / 2 + "," + height * 0.50 + ")");


                    var partition = d3.layout.partition()
                        .sort(null)
                        .size([2 * Math.PI, radius * radius])
                        .value(function (d) {
                            return d.size;
                        })
                        .children(function (d) {
                            return d.children;
                        });

                    var arc = d3.svg.arc()
                        .startAngle(function (d) {
                            return d.x;
                        })
                        .endAngle(function (d) {
                            return d.x + d.dx;
                        })
                        .innerRadius(function (d) {
                            return Math.sqrt(d.y);
                        })
                        .outerRadius(function (d) {
                            return Math.sqrt(d.y + d.dy);
                        });

                    svg.datum(scope.data).selectAll("path")
                        .data(partition.nodes)
                        .enter().append("path")
                        .attr("display", function (d) {
                            return d.depth ? null : "none";
                        }) // hide inner ring
                        .attr("d", arc)
                        .attr("bs-tooltip", function () {
                            return "'hello'";
                        })
                        .style("stroke", "#fff")
                        .style("fill", function (d) {
                            if (d.depth > 0) {
                                return color(d.name);
                            }
                        }).each(stash)
                        .on("mouseover", mouseover)
                        .on("mouseleave", mouseleave)
                        .on("click", click);

                    svg.selectAll("text.label").data(partition(scope.data));

                    // Hide the spinning wheel icon
                    scope.panelMeta.loading = false;
                    var $tooltip = $('<div id="sunbursttooltip">');
                }
            }
        };
    });
});
