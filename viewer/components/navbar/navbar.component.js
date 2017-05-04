(function() {

  'use strict';

  /**
   * @class NavbarController
   * @classdesc Interacts with the navbar
   * @example
   * '<navbar></navbar>'
   */
  class NavbarController {

    /**
     * Initialize global variables for this controller
     * @param $location     Exposes browser address bar URL
     *                      (based on the window.location)
     * @param molochVersion The installed version of moloch
     *
     * @ngInject
     */
    constructor($location, molochVersion) {
      this.$location      = $location;
      this.molochVersion  = molochVersion.version;
    }

    /* Callback when component is mounted and ready */
    $onInit() {
      this.activeTab = this.$location.path().split('/')[1];

      this.menu = {
        sessions    : { title: 'Sessions',    link: 'sessions' },
        spiview     : { title: 'SPI View',    link: 'spiview' },
        spigraph    : { title: 'SPI Graph',   link: 'spigraph' },
        connections : { title: 'Connections', link: 'connections' },
        files       : { title: 'Files',       link: 'files' },
        stats       : { title: 'Stats',       link: 'stats' },
        settings    : { title: 'Settings',    link: 'settings' },
        users       : { title: 'Users',       link: 'users', permission: 'createEnabled' },
        upload      : { title: 'Upload',      link: 'upload', permission: 'canUpload' }
      };
    }


    /* exposed functions --------------------------------------------------- */
    /**
     * Determines whether a tab is active based on it's link
     * @param {string} route The route of the nav item
     */
    isActive(link) {
      return this.activeTab === link;
    }

    /**
     * Redirects to the desired link preserving query parameters
     * @param {string} link The link to redirect to
     */
    navTabClick(link) {
      if (link === 'help') {
        // going to help page, so set section of help to navigate to
        this.$location.hash(this.activeTab);
      }

      this.activeTab = link;

      this.$location.path(link);
    }

  }

  NavbarController.$inject = ['$location','molochVersion'];

  /**
   * Navbar Directive
   * Displays the navbar
   */
  angular.module('directives.navbar', [])
    .component('navbar', {
      template  : require('html!./navbar.html'),
      controller: NavbarController
    });

})();
