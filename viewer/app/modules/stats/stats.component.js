(function() {

  'use strict';

  let interval, graphInitialized;

  /**
   * @class StatsController
   * @classdesc Interacts with moloch stats page
   * @example
   * '<moloch-fields></moloch-fields>'
   */
  class StatsController {

    /**
     * Initialize global variables for this controller
     * @param StatsService  Transacts stats with the server
     *
     * @ngInject
     */
    constructor($scope, $interval, $routeParams, StatsService, UserService) {
      this.$scope         = $scope;
      this.$interval      = $interval;
      this.$routeParams   = $routeParams;
      this.StatsService   = StatsService;
      this.UserService    = UserService;
    }

    /* Callback when component is mounted and ready */
    $onInit() {
      this.loading = true;

      this.currentPage = 1; // always start on first page

      this.query = {        // default query params
        length    : 10,
        start     : 0,
        filter    : null,
        sortField : 'nodeName',
        desc      : false
      };

      if (this.$routeParams.length) { // update length param if in url
        this.query.length = this.$routeParams.length;
      }

      this.expanded = {};

      this.graphSelect          = 'deltaPacketsPerSec';
      this.graphTimeSelect      = '5';
      this.updateIntervalSelect = '5000';

      // all sections are open to start
      this.graphsOpen     = true;
      this.nodeStatsOpen  = true;
      this.esStatsOpen    = true;

      this.selectedTab    = 0; // select the first tab

      this.UserService.getSettings()
        .then((response) => {this.settings = response; })
        .catch((error)   => {this.settings = { timezone:'local' }; });

      // build colors array from css variables
      let styles = window.getComputedStyle(document.body);
      let primaryLighter  = styles.getPropertyValue('--color-primary-lighter').trim();
      let primaryLight    = styles.getPropertyValue('--color-primary-light').trim();
      let primary         = styles.getPropertyValue('--color-primary').trim();
      let primaryDark     = styles.getPropertyValue('--color-primary-dark').trim();
      let secondaryLighter= styles.getPropertyValue('--color-tertiary-lighter').trim();
      let secondaryLight  = styles.getPropertyValue('--color-tertiary-light').trim();
      let secondary       = styles.getPropertyValue('--color-tertiary').trim();
      let secondaryDark   = styles.getPropertyValue('--color-tertiary-dark').trim();
      this.colors = [primaryDark, primary, primaryLight, primaryLighter,
                     secondaryLighter, secondaryLight, secondary, secondaryDark];

      this.columns = [
        { name: '', doStats: false},
        { name: 'Node', sort: 'nodeName', doStats: false },
        { name: 'Time', sort: 'currentTime', doStats: true },
        { name: 'Sessions', sort: 'monitoring', doStats: true },
        { name: 'Free Space', sort: 'freeSpaceM', doStats: true },
        { name: 'CPU', sort: 'cpu', doStats: true },
        { name: 'Memory', sort: 'memory', doStats: true },
        { name: 'Packet Q', sort: 'packetQueue', doStats: true },
        { name: 'Packet/s', sort: 'deltaPackets', field: 'deltaPacketsPerSec', doStats: true },
        { name: 'Bytes/s', sort: 'deltaBytes', field: 'deltaBytesPerSec', doStats: true },
        { name: 'Sessions/s', sort: 'deltaSessions', field: 'deltaSessionsPerSec', doStats: true },
        { name: 'Packet Drops/s', sort: 'deltaDropped', field: 'deltaDroppedPerSec', doStats: true },
        { name: 'Overload Drops/s', sort: 'deltaOverloadDropped', field: 'deltaOverloadDroppedPerSec', doStats: true },
        { name: 'ES Drops/s', sort: 'deltaESDropped', field: 'deltaESDroppedPerSec', doStats: true }
      ];

      this.loadData();
      interval = this.$interval(() => { this.loadData(); }, parseInt(this.updateIntervalSelect));

      this.$scope.$on('change:pagination', (event, args) => {
        // pagination affects length, currentPage, and start
        this.query.length = args.length;
        this.query.start  = args.start;
        this.currentPage  = args.currentPage;

        this.loadData();
      });

      // watch for the user to leave or return to the page
      // Don't load graph data if the user is not focused on the page!
      // if data is loaded in an inactive (background) tab,
      // the user will experience gaps in their cubism graph data
      // cubism uses setTimeout to delay requests
      // inactive tabs' timeouts are clamped and can fire late;
      // cubism requires little error in the timing of requests
      // for more info, view the "reasons for delays longer than specified" section of:
      // https://developer.mozilla.org/en-US/docs/Web/API/WindowTimers/setTimeout#Inactive_tabs
      if(document.addEventListener) {
        document.addEventListener('visibilitychange', () => {
          if (!this.context) { return; }
          if (document.hidden) { this.context.stop(); }
          else if (this.graphTimeSelect !== '0' && this.graphsOpen) {
            this.context.start();
          }
        });
      }
    }

    $onDestroy() {
      this.$interval.cancel(interval);
      interval = null;
    }

    changeInterval() {
      if (interval) {
        this.$interval.cancel(interval);

        if (this.updateInterval === '0') { return; }

        interval = this.$interval(() => { this.loadData(); }, parseInt(this.updateIntervalSelect));
      }
    }

    columnClick(name) {
      this.sortField    = name;
      this.sortReverse  = !this.sortReverse;
      this.loadData();
    }

    toggleGraphs() {
      if (!this.context) { return; }

      if (this.graphsOpen) { this.context.stop(); }
      else if (this.graphTimeSelect !== '0') { this.context.start(); }
    }

    selectTab(index) {
      this.selectedTab = index;

      if (index !== 0) {
        this.$interval.cancel(interval);
        interval = null;

        if (this.context) { this.context.stop(); }
      } else if (index === 0) {
        graphInitialized = false;
        this.loadData();
        // if (this.context && this.graphsOpen) { this.context.start(); }
        if (this.updateInterval !== '0') {
          interval = this.$interval(() => { this.loadData(); }, parseInt(this.updateIntervalSelect));
        }
      }
    }

    loadData() {
      if (this.graphTimeSelect === '0') {
        if (!this.context) { return; }
        this.context.stop();
        return;
      }

      this.loading = true;

      this.StatsService.getMolochStats(this.query)
        .then((response) => {
          this.loading  = false;
          this.stats    = response;

          this.averageValues = {};
          this.totalValues = {};
          var stats = this.stats.data;

          var columnNames = this.columns.map(function(item) {return item.field || item.sort;});
          columnNames.push('memoryP');
          columnNames.push('freeSpaceP');

          for (var i = 3; i < columnNames.length; i++) {
            var columnName = columnNames[i];

            this.totalValues[columnName] = 0;
            for (var s = 0; s < stats.length; s++) {
              this.totalValues[columnName] += stats[s][columnName];
            }
            this.averageValues[columnName] = this.totalValues[columnName]/stats.length;
          }

          if (this.stats.data && !graphInitialized) {
            graphInitialized = true; // only make the graph once when page loads
            this.makeStatsGraph(this.graphSelect, parseInt(this.graphTimeSelect, 10));
          }
        })
        .catch((error) => {
          this.loading  = false;
          this.error    = error;
        });
    }

    /**
     * Creates a cubism graph of time series data for a specific metric
     * https://github.com/square/cubism/wiki/Metric
     * @param {string} metricName the name of the metric to visualize data for
     */
    makeStatsGraph(metricName, interval) {
      var self = this;
      if (self.context) {self.context.stop();} // Stop old context
      self.context = cubism.context()
        .step(interval * 1000)
        .size(1440);
      var context = self.context;
      var nodes = self.stats.data.map(function(item) {return item.nodeName;});

      function metric(name) {
        return context.metric(function(startV, stopV, stepV, callback) {
          self.StatsService.getDetailStats({nodeName: name,
                                            start: startV/1000,
                                            stop: stopV/1000,
                                            step: stepV/1000,
                                            interval: interval,
                                            name: metricName})
            .then((response)  => { callback(null, response); })
            .catch((error)    => { return callback(new Error('Unable to load data')); });
        }, name);
      }


      context.on('focus', function(i) {
        d3.selectAll('.value').style('right', i === null ? null : context.size() - i + 'px');
      });

      $('#statsGraph').empty();
      d3.select('#statsGraph').call(function(div) {
        var metrics = [];
        for (var i = 0, ilen = nodes.length; i < ilen; i++) {
          metrics.push(metric(nodes[i]));
        }

        div.append('div')
          .attr('class', 'axis')
          .call(context.axis().orient('top'));

        div.selectAll('.horizon')
          .data(metrics)
          .enter().append('div')
          .attr('class', 'horizon')
          .call(context.horizon().colors(self.colors));

        div.append('div')
          .attr('class', 'rule')
          .call(context.rule());

      });
    }

    toggleStatDetail(stat) {
      var self = this;
      let id   = stat.id.replace(/[.:]/g, '\\$&');

      this.expanded[id] = !this.expanded[id];

      $(document.getElementById('statsGraph-' + id)).empty();

      if (!this.expanded[id]) {return;}

      var dcontext = cubism.context()
         .serverDelay(0)
         .clientDelay(0)
         .step(60e3)
         .size(1440);

      function dmetric(name, mname) {
        return dcontext.metric(function(startV, stopV, stepV, callback) {
          self.StatsService.getDetailStats({nodeName: stat.id,
            start: startV/1000,
            stop: stopV/1000,
            step: stepV/1000,
            interval: 60,
            name: mname})
             .then((response)  => {
               callback(null, response);
             })
             .catch((error)    => { return callback(new Error('Unable to load data')); });
        }, name);
      }
      var headerNames = this.columns.map(function(item) {return item.name;});
      var dataSrcs = this.columns.map(function(item) {return item.sort;});
      var metrics = [];
      for (var i = 3; i < headerNames.length; i++) {
        if (headerNames[i].match('/s')) {
          metrics.push(dmetric(headerNames[i].replace('/s', '/m'), dataSrcs[i].replace('PerSec', '')));
        } else {
          metrics.push(dmetric(headerNames[i], dataSrcs[i]));
        }
      }

      d3.select('#statsGraph-' + id).call(function(div) {
        div.append('div')
           .attr('class', 'axis')
           .call(dcontext.axis().orient('top'));

        div.selectAll('.horizon')
           .data(metrics)
           .enter().append('div')
           .attr('class', 'horizon')
           .call(dcontext.horizon().colors(self.colors));

        div.append('div')
           .attr('class', 'rule')
           .call(dcontext.rule());

      });

      dcontext.on('focus', function(i) {
        d3.selectAll('.value').style('right', i === null ? null : dcontext.size() - i + 'px');
      });
    }

  }


  StatsController.$inject = ['$scope','$interval','$routeParams',
    'StatsService','UserService'];

  /**
   * Moloch Stats Directive
   * Displays pcap stats
   */
  angular.module('moloch')
     .component('molochStats', {
       template  : require('html!./stats.html'),
       controller: StatsController
     });

})();
