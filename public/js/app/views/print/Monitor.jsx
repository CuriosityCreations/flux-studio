define([
    'jquery',
    'react',
    'plugins/classnames/index',
    'helpers/api/control',
    'helpers/api/3d-scan-control',
    'helpers/device-master',
    'app/actions/alert-actions',
    'app/stores/alert-store',
    'app/constants/device-constants',
    'app/actions/global-actions',
    'app/constants/global-constants',
    'helpers/sprintf',
    'helpers/round',
    'helpers/duration-formatter'
], function(
    $,
    React,
    ClassNames,
    control,
    scanControl,
    DeviceMaster,
    AlertActions,
    AlertStore,
    DeviceConstants,
    GlobalActions,
    GlobalConstants,
    sprintf,
    round,
    formatDuration
) {
    'use strict';

    var _id = 'MONITOR',
        pathArray,
        start,
        scrollSize = 10,
        currentLevelFiles = [],
        filesInfo = [],
        history = [],
        reporter,
        status,
        filePreview = false,
        usbExist = false,
        showingPopup = false,
        messageViewed = false,
        fileNameLength = 12,
        operationStatus,
        displayStatus,
        currentStatus,
        previewUrl = '',
        lang,
        lastAction,
        fileToBeUpload = {},
        statusActions,
        openSource,
        errorActions,

        // error display
        mainError = '',
        subError = '',
        lastError = '',
        errorMessage = '',
        headInfo = '',
        taskInfo = '',

        currentDirectoryContent,
        socketStatus = {},

        timeoutLength = 20000,
        timmer,

        // for monitor temperature, time...
        percentageDone = 0,
        progress = 0,
        totalTimeInSeconds = 0,
        timeLeft =  0,
        progress = '',
        temperature = '',
        statusId = 0,

        refreshTime = 3000;

    var mode = {
        PRINT       : 'PRINT',
        PREVIEW     : 'PREVIEW',
        BROWSE_FILE : 'BROWSE_FILE',
        CAMERA      : 'CAMERA'
    };

    var type = {
        FILE: 'FILE',
        FOLDER: 'FOLDER'
    };

    var source = {
        DEVICE_LIST : 'DEVICE_LIST',
        GO          : 'GO'
    };

    var operation,
        wait,
        go,
        pause,
        stop,
        preparing,
        commands,
        action,
        cameraClass,
        cameraDescriptionClass,
        upload,
        download,
        camera,
        leftButton,
        middleButton,
        rightButton,
        deviceStatus,

        leftButtonOn = true,
        middleButtonOn = true,
        rightButtonOn = true;

    var opts = {};
    var temp = [];

    operationStatus = [
        DeviceConstants.RUNNING,
        DeviceConstants.PAUSED,
        DeviceConstants.RESUMING,
        DeviceConstants.ABORTED,
    ];

    statusActions = {
        'IDLE': function() {
            displayStatus = lang.device.ready;
            currentStatus = DeviceConstants.READY;
        },

        'INIT': function() {
            displayStatus = lang.device.starting;
            currentStatus = DeviceConstants.STARTING;
        },

        'STARTING': function() {
            displayStatus = lang.device.starting;
            currentStatus = '';
        },

        'RUNNING': function() {
            displayStatus = lang.device.running;
            currentStatus = DeviceConstants.RUNNING;
            lastError = '';
        },

        'PAUSED': function() {
            displayStatus = lang.device.paused;
            currentStatus = DeviceConstants.PAUSED;
        },

        'PAUSING': function() {
            displayStatus = lang.device.pausing;
            currentStatus = DeviceConstants.PAUSED;
        },

        'WAITING_HEAD': function() {
            displayStatus = lang.device.heating;
            currentStatus = DeviceConstants.HEATING;
            leftButtonOn = false;
        },

        'CORRECTING': function() {
            displayStatus = lang.device.calibrating;
            currentStatus = DeviceConstants.CALIBRATING;
        },

        'COMPLETING': function() {
            displayStatus = lang.device.completing;
            currentStatus = '';
        },

        'COMPLETED': function() {
            displayStatus = lang.device.completed;
            currentStatus = '';
            if(openSource === GlobalConstants.PRINT) {
                DeviceMaster.quit();
            }
        },

        'ABORTED': function() {
            displayStatus = lang.device.aborted;
            currentStatus = '';
            if(openSource === GlobalConstants.PRINT) {
                DeviceMaster.quit();
            }
        },

        'RESUMING': function() {
            displayStatus = lang.device.starting;
            currentStatus = DeviceConstants.RUNNING;
        },

        'OCCUPIED': function() {
            displayStatus = lang.device.occupied;
            currentStatus = DeviceConstants.PAUSED;
        },

        'SCANNING': function() {
            displayStatus = lang.device.scanning;
            currentStatus = '';
        }
    };

    errorActions = {
        'UNKNOWN_STATUS': function() {
            DeviceMaster.quit();
        },

        'AUTH_ERROR': function() {
            this._stopReport();
        },

        'USER_OPERATION': function(_statusId) {
            if(_statusId === DeviceConstants.status.ABORTED) {
                DeviceMaster.quit();
            }
        }
    };

    return React.createClass({

        propTypes: {
            lang                : React.PropTypes.object,
            selectedDevice      : React.PropTypes.object,
            fCode               : React.PropTypes.object,
            slicingStatus       : React.PropTypes.object,
            previewUrl          : React.PropTypes.string,
            opener              : React.PropTypes.string,
            onClose             : React.PropTypes.func
        },

        getInitialState: function() {
            var _mode = mode.PREVIEW;
            openSource = this.props.opener || GlobalConstants.DEVICE_LIST;
            if(openSource === GlobalConstants.DEVICE_LIST &&
                this.props.selectedDevice.st_id === DeviceConstants.status.IDLE){
                    _mode = mode.BROWSE_FILE;
            }

            return {
                waiting             : false,
                mode                : _mode,
                directoryContent    : {},
                cameraImageUrl      : '',
                selectedItem        : '',
                progress            : '',
                currentStatus       : DeviceConstants.READY,
                displayStatus       : ''
            };
        },

        componentWillMount: function() {
            var self = this;
                opts = {
                    onError: function(data) {
                        AlertActions.showError(data);
                    },
                    onReady: function() {
                        self.setState({ waiting: false });
                    }
                };

            pathArray   = [];
            lang        = this.props.lang;
            previewUrl  = this.props.previewUrl;
            statusId    = DeviceConstants.status.IDLE;

            socketStatus.ready = true;
            socketStatus.cancel = false;
        },

        componentDidMount: function() {
            AlertStore.onRetry(this._handleRetry);
            AlertStore.onCancel(this._handleCancel);
            AlertStore.onYes(this._handleYes);
            this._addHistory();

            socketStatus.ready = false;
            DeviceMaster.getReport().then(function(report) {
                this._processReport(report);
                if(this.state.mode === mode.BROWSE_FILE) {
                    currentStatus = DeviceConstants.READY;
                    this._refreshDirectory();
                }
                return this._checkUSBFolderExistance();
            }.bind(this)).then(function(exist) {
                usbExist = exist;
                socketStatus.reader = true;
            }.bind(this));

            if(openSource === GlobalConstants.DEVICE_LIST) {
                socketStatus.ready = false;
                var t = setInterval(function() {
                    clearInterval(t);
                    DeviceMaster.getPreviewInfo().then(function(info) {
                        this._startReport();
                        socketStatus.ready = true;
                        this._processInfo(info);
                    }.bind(this));
                }.bind(this), 200);
            }
            else {
                totalTimeInSeconds = parseInt(this.props.slicingStatus.time);

                this._startReport();
            }
        },

        shouldComponentUpdate: function(nextProps, nextState) {
            return JSON.stringify(this.state) !== JSON.stringify(nextState);
        },

        componentWillUnmount: function() {
            AlertStore.removeRetryListener(this._handleRetry);
            AlertStore.removeCancelListener(this._handleCancel);
            AlertStore.removeYesListener(this._handleYes);

            if(this.state.mode === mode.CAMERA) {
                DeviceMaster.stopCamera();
            }
            this._stopReport();
            history = [];
            messageViewed = false;
            totalTimeInSeconds = '';
            taskInfo = '';
        },

        _hasFCode: function() {
            return this.props.fCode instanceof Blob;
        },

        _refreshDirectory: function() {
            this._retrieveFolderContent(pathArray.join('/'));
        },

        _existFileInDirectory: function(path, fileName) {
            var d = $.Deferred();
            DeviceMaster.fileInfo(path, fileName).then(function(result) {
                d.resolve(result.error !== DeviceConstants.NOT_EXIST);
            });
            return d.promise();
        },

        _doFileUpload: function(file) {
            this._stopReport();
            var self = this,
                reader = new FileReader();

            reader.readAsArrayBuffer(file);
            reader.onload = function() {
                var fileInfo = file.name.split('.'),
                    ext = fileInfo[fileInfo.length - 1],
                    type,
                    isValid = false;

                if(ext === 'fc') {
                    type = {type: 'application/fcode'};
                    isValid = true;
                }
                else if (ext === 'gcode') {
                    type = {type: 'text/gcode'};
                    isValid = true;
                }

                if(isValid) {
                    var blob = new Blob([reader.result], type);
                    DeviceMaster.uploadFile(blob, file, pathArray.join('/')).then(function(result) {
                        self._startReport();
                        self._refreshDirectory();
                    });
                }
                else {
                    AlertActions.showPopupInfo('', lang.monitor.extensionNotSupported);
                }
            };
        },

        _handleClose: function() {
            this.props.onClose();
        },

        _handleRetry: function(id) {
            if(id === _id) {
                if(statusId === DeviceConstants.status.ABORTED) {
                    DeviceMaster.quit().then(function() {
                        this.setState({ currentStatus: DeviceConstants.READY }, function() {
                            this._handleGo();
                        });
                    }.bind(this));
                }
                else if(this.state.currentStatus === DeviceConstants.PAUSED) {
                    DeviceMaster.resume();
                    setTimeout(function(){
                        messageViewed = false;
                        showingPopup = false;
                    }, 1200);
                }
            }
        },

        _handleCancel: function(id) {
            messageViewed = true;
            showingPopup = false;
        },

        _handleYes: function(id) {
            if(id === DeviceConstants.KICK) {
                socketStatus.ready = false;
                DeviceMaster.kick().then(function() {
                    socketStatus.reader = true;
                    this._startReport();
                }.bind(this));
            }
            else if(id === 'uploadFile') {
                var info    = fileToBeUpload.name.split('.'),
                    ext     = info[info.length - 1];

                if(ext === 'gcode') {
                    AlertActions.showPopupYesNo('confirmGToF', lang.monitor.confirmGToF);
                }
                else {
                    this._doFileUpload(fileToBeUpload);
                }
            }
            else if(id === 'confirmGToF') {
                this._doFileUpload(fileToBeUpload);
            }
        },

        _handleBrowseFolder: function() {
            this._stopReport();
            DeviceMaster.stopCamera();
            filesInfo = [];
            pathArray = [];

            this._retrieveFolderContent('').then(function() {
                this._startReport();
                this.setState({
                    mode: mode.BROWSE_FILE
                }, function() {
                    this._addHistory();
                });
            }.bind(this));
        },

        _handleSelectFolder: function(pathName) {
            var dir = this.state.currentDirectoryFolders;
            // if it's a directory
            if(dir.some(function(d) {
                return d === pathName;
            })) {
                pathArray.push(pathName);
                start = 0;
                socketStatus.cancel = false;
                var t = setInterval(function() {
                    if(socketStatus.ready) {
                        this._retrieveFolderContent(pathArray.join('/'));
                        clearInterval(t);
                    }
                }.bind(this), 100);

                // this.setState({ waiting: true });
                this._addHistory();
            }
        },

        _handleBrowseUpLevel: function() {
            if(pathArray.length === 0) {
                this.setState({ mode: mode.PREVIEW });
                this._startReport();
                return;
            }
            pathArray.pop();
            socketStatus.cancel = true;
            var t = setInterval(function() {
                if(socketStatus.ready) {
                    this._retrieveFolderContent(pathArray.join('/'));
                    clearInterval(t);
                }
            }, 100);
        },

        _handleBack: function() {
            var self = this;
            if(history.length > 1) {
                history.pop();
                pathArray.pop();
                temp.pop();
            }
            filePreview = false;
            lastAction = history[history.length - 1];

            if(this.state.mode === mode.CAMERA) {
                socketStatus.ready = false;
                DeviceMaster.stopCamera().then(function() {
                    return DeviceMaster.kick();
                }).then(function() {
                    socketStatus.ready = true;
                });
            }

            var actions = {

                'PREVIEW' : function() {
                    self._startReport();
                },

                'BROWSE_FILE': function() {
                    var t = setInterval(function() {
                        if(socketStatus.ready) {
                            self._retrieveFolderContent(lastAction.path.join('/'));
                            clearInterval(t);
                        }
                    }.bind(this), 100);
                },

                'CAMERA': function() {
                }
            };

            if(actions[lastAction.mode]) {
                actions[lastAction.mode]();
                this.setState({ mode: lastAction.mode });
            }
        },

        _handleScroll: function(e) {
            if(this.state.mode === mode.BROWSE_FILE) {
                var onNeedData = e.target.scrollHeight === e.target.offsetHeight + e.target.scrollTop;
                if(onNeedData) {
                    this._renderFolderFilesWithPreview();
                }
            }
        },

        _handleSelectFile: function(fileName, action, e) {
            e.stopPropagation();
            if(action === DeviceConstants.SELECT) {
                this.setState({
                    selectedItem: fileName,
                    selectedItemType: type.FILE
                });
            }
            else {
                start = 0;
                DeviceMaster.fileInfo(pathArray.join('/'), fileName).then(function(info) {
                    if(info[1] instanceof Blob) {
                        this._processInfo([info[2]]);
                        previewUrl = info[1].size === 0 ? '/img/ph_l.png' : URL.createObjectURL(info[1]);
                        filePreview = true;
                        pathArray.push(fileName);
                        this.setState({
                            mode: mode.PREVIEW,
                            currentStatus: deviceStatus.st_id === DeviceConstants.status.COMPLETED ? DeviceConstants.READY : this.state.currentStatus
                        }, function() {
                            socketStatus.ready = false;
                            DeviceMaster.getReport().then(function(report) {
                                socketStatus.ready = true;
                                this._processReport(report);
                            }.bind(this));
                            this._addHistory();
                        });
                    }
                    else {
                        AlertActions.showPopupInfo('', lang.monitor.cannotPreview);
                    }
                    this.forceUpdate();
                }.bind(this));
            }
        },

        _handleHighlightFolder: function(folderName, e) {
            e.stopPropagation();
            this.setState({
                selectedItem: this.state.selectedItem === folderName ? '' : folderName,
                selectedItemType: this.state.selectedItem === folderName ? '' : type.FOLDER
            });
        },

        _handleCancelSelectItem: function(e) {
            this.setState({
                selectedItem: '',
                selectedItemType: ''
            });
        },

        _handleUpload: function(e) {
            if(e.target.files.length > 0) {
                fileToBeUpload = e.target.files[0];
                this._existFileInDirectory(pathArray, fileToBeUpload.name).then(function(exist) {
                    if(exist) {
                        AlertActions.showPopupYesNo('uploadFile', lang.monitor.fileExistContinue);
                    }
                    else {
                        var info = fileToBeUpload.name.split('.'),
                            ext  = info[info.length - 1];

                        if(ext === 'gcode') {
                            AlertActions.showPopupYesNo('confirmGToF', lang.monitor.confirmGToF);
                        }
                        else {
                            this._doFileUpload(fileToBeUpload);
                        }
                    }
                }.bind(this));
                e.target.value = null;
            }
        },

        _handleDownload: function() {
            start = 0;
            DeviceMaster.fileInfo(pathArray.join('/'), this.state.selectedItem).then(function(info) {
                if(info[1] instanceof Blob) {
                    saveAs(info[1], info[0]);
                }
                else {
                    AlertActions.showPopupInfo('', lang.monitor.fileNotDownloadable);
                }
            }.bind(this));
        },

        _handleToggleCamera: function() {
            if(this.state.mode === mode.CAMERA) {
                this._handleBack();
                return;
            }
            DeviceMaster.readyCamera().then(function() {
                DeviceMaster.startCamera(this._processImage);
            }.bind(this));

            this._stopReport();
            this.setState({
                waiting: true,
                mode: mode.CAMERA
            }, function() {
                this._addHistory();
            });
        },

        _handleGo: function() {
            var self = this;
            this._stopReport();

            if(this.state.currentStatus === DeviceConstants.READY) {
                var blob = this.props.fCode;

                this.setState({
                    currentStatus: DeviceConstants.STARTING,
                    mode: mode.PRINT
                });

                if(blob) {
                    DeviceMaster.go(blob, function(_progress) {
                        if(_progress !== 100) {
                            self.setState({ displayStatus: `${lang.device.uploading} ${_progress}%`});
                        }
                        else {
                            self.setState({ displayStatus: `${lang.device.processing}`});
                        }
                    }).then(function() {
                        self._startReport();
                    });
                }
                else {
                    var executeGo = function() {
                        DeviceMaster.goFromFile(pathArray, '').then(function(result) {
                            self._startReport();
                        });
                    };

                    if(
                        deviceStatus.st_id === DeviceConstants.status.COMPLETED ||
                        deviceStatus.st_id === DeviceConstants.status.ABORTED
                    ) {
                        DeviceMaster.quit().then(function() {
                            setTimeout(function() {
                                executeGo();
                            }, 1000);
                        });
                    }
                    else {
                        executeGo();
                    }

                }

            }
            else {
                DeviceMaster.resume().then(function() {
                    this._startReport();
                }.bind(this));
            }
        },

        _handlePause: function() {
            DeviceMaster.pause();
        },

        _handleStop: function() {
            if(statusId < 0) {
                this._stopReport();
                AlertActions.showPopupYesNo('KICK', lang.monitor.forceStop);
            }
            else {
                DeviceMaster.stop();
            }
        },

        _addHistory: function() {
            history.push({
                mode: this.state.mode,
                previewUrl: previewUrl,
                path: pathArray.slice()
            });
        },

        _startReport: function() {
            var self = this;
            this._stopReport();
            timmer = setTimeout(this._processTimeout, timeoutLength);

            reporter = setInterval(function() {
                socketStatus.ready = false;
                DeviceMaster.getReport().then(function(report) {
                    socketStatus.ready = true;
                    self._processReport(report);
                });
            }, refreshTime);
        },

        _processTimeout: function() {
            clearTimeout(timmer);
            DeviceMaster.reconnect();
            if($('.flux-monitor')[0]){
                //Show disconnect if FLUX Monitor exists..
                AlertActions.showPopupError('disconnect', sprintf(lang.device.disconnectedError.message, DeviceMaster.getSelectedDevice().name), lang.device.disconnectedError.caption);
            }
            this._handleClose();
        },

        _processInfo: function(info) {
            this._startReport();
            if(info === '') {
                return;
            }
            info = info || [];
            info[0] = info[0] || {};

            if(!this._hasFCode()) {
                if(info[2] instanceof Blob) {
                    previewUrl = window.URL.createObjectURL(info[2]);
                }
            }

            if(!info[0].TIME_COST) {
                return;
            }

            if(info[0].TIME_COST) {
                totalTimeInSeconds = info[0].TIME_COST;
            }

            if(info[0].HEAD_TYPE) {
                taskInfo = lang.monitor.task[info[0].HEAD_TYPE.toUpperCase()];
            }
            else {
                taskInfo = 'Unknown';
            }
            this.forceUpdate();
        },

        _processReport: function(report) {
            errorMessage    = '';
            mainError       = '';
            subError        = '';
            status          = report.st_label;
            statusId        = report.st_id;
            leftButtonOn    = true;
            middleButtonOn  = true;
            rightButtonOn   = true;
            deviceStatus    = report;

            clearTimeout(timmer);
            timmer = setTimeout(this._processTimeout, timeoutLength);
            // rootMode = statusId === DeviceConstants.status.IDLE ? DeviceConstants.IDLE : DeviceConstants.RUNNING;

            // jug down errors as main and sub error for later use
            if(report.error) {
                if(typeof(report.error) === 'string') {
                    mainError = report.error;
                }
                else {
                    mainError = report.error[0] || '';
                    subError = report.error[1] || '';
                }

                if(lastError !== mainError) {
                    messageViewed = false;
                    lastError = mainError;
                }

                errorMessage = lang.monitor[report.error.join('_')] || report.error.join(' ');
            }

            if(errorActions[mainError]) {
                errorActions[mainError](statusId);
            }

            if(
                !messageViewed &&
                !showingPopup &&
                mainError !== DeviceConstants.USER_OPERATION &&
                mainError.length > 0 &&
                errorMessage.length > 0
            ) {
                AlertActions.showPopupRetry(_id, errorMessage);
                showingPopup = true;
            }

            // actions responded to status
            status = statusId === DeviceConstants.status.SCAN ? DeviceConstants.SCANNING : status;
            status = statusId === DeviceConstants.status.ABORTED ? DeviceConstants.ABORTED : status;
            if(statusActions[status]) {
                statusActions[status]();
            }

            if(statusId === DeviceConstants.status.PAUSED_FROM_RUNNING) {
                displayStatus = lang.device.paused;
                currentStatus = DeviceConstants.PAUSED;
            }

            if(report.prog && !!totalTimeInSeconds) {
                percentageDone = parseInt(report.prog * 100);
                timeLeft = formatDuration(totalTimeInSeconds * (1 - report.prog));
                progress = `${percentageDone}%, ${timeLeft} ${lang.monitor.left}`;
            }
            else {
                progress = '';
                percentageDone = 0;
            }

            report.rt = round(report.rt, -1) || 0;

            if(status === DeviceConstants.RUNNING) {
                temperature = report.rt ? `${lang.monitor.temperature} ${parseInt(report.rt * 10) / 10} °C` : '';
            }
            else {
                temperature = report.rt ? `${lang.monitor.temperature} ${parseInt(report.rt * 10) / 10} °C / ${report.tt} °C` : '';
            }

            headInfo = report.module ? lang.monitor.device[report.module] : '';

            if(!report.error || report.error.length === 0) {
                //If home failed, at least show an error
                if(statusId !== DeviceConstants.status.IDLE) {
                    AlertActions.closePopup();
                    showingPopup = false;
                }
            }

            if(this._isAbortedOrCompleted()) {
                temperature = '';
                progress = '';
            }

            if(!report.error) {
                if(statusId !== DeviceConstants.status.IDLE) {
                    AlertActions.closePopup();
                }
            }

            if(this._isAbortedOrCompleted() && pathArray.length > 0) {
                currentStatus = DeviceConstants.READY;
            }

            if(currentStatus === '') {
                currentStatus = status;
            }


            var report_info = {
                temperature: temperature,
                currentStatus: currentStatus,
                displayStatus: displayStatus,
                progress: progress
            };

            //If report returns idle state, which means nothing to preview..
            if(openSource === GlobalConstants.DEVICE_LIST &&
                report.st_id === DeviceConstants.status.IDLE &&
                this.state.mode === mode.PREVIEW &&
                filePreview !== true){
                report_info['mode'] = mode.BROWSE_FILE;
            }

            this.setState(report_info);
        },

        _isError: function(s) {
            return operationStatus.indexOf(s) < 0;
        },

        _isAbortedOrCompleted: function() {
            return (
                statusId === DeviceConstants.status.ABORTED ||
                statusId === DeviceConstants.status.COMPLETED
            );
        },

        _stopReport: function() {
            clearInterval(reporter);
            clearTimeout(timmer);
            reporter = null;
            timmer = null;
        },

        _processImage: function(imageBlobs, mimeType) {
            var blob = new Blob(imageBlobs, {type: mimeType});
            var url = URL.createObjectURL(blob);
            this.setState({
                cameraImageUrl: url,
                waiting: false
            });
        },

        _retrieveFolderContent: function(path) {
            var self = this,
                d = $.Deferred();

            socketStatus.cancel = false;
            socketStatus.ready = false;
            DeviceMaster.ls(path).then(function(result) {
                socketStatus.ready = true;
                if(result.error) {
                    if(result.error !== DeviceConstants.NOT_EXIST) {
                        AlertActions.showPopupError(result.error);
                        result.directories = [];
                    }
                }
                currentDirectoryContent = result;
                start = 0;

                if(!usbExist && pathArray.length === 0) {
                    var i = currentDirectoryContent.directories.indexOf('USB');
                    if(i >= 0) {
                        currentDirectoryContent.directories.splice(i, 1);
                    }
                }
                currentDirectoryContent.files = currentDirectoryContent.files.map(function(file) {
                    var a = [];
                    a.push(file);
                    return a;
                });
                self.setState({
                    currentDirectoryFolders: currentDirectoryContent.directories,
                    currentDirectoryFiles: currentDirectoryContent.files,
                    wait: false
                }, function() {
                    self._renderFolderFilesWithPreview();
                    d.resolve('');
                });
            });
            return d.promise();
        },

        _renderFolderFilesWithPreview: function() {
            this._stopReport();
            if(currentDirectoryContent.files.length === 0) {
                this._startReport();
                return;
            }

            var end = start + scrollSize;
            if(end > currentDirectoryContent.files.length) {
                end = currentDirectoryContent.files.length;
            }

            this._retrieveFileInfo(start, end, function(filesArray) {
                var files = currentDirectoryContent.files;

                Array.prototype.splice.apply(files, [start, filesArray.length].concat(filesArray));
                this.setState({ currentDirectoryFiles: files }, function() {
                    this.forceUpdate();
                    start = start + scrollSize;
                }.bind(this));
                socketStatus.ready = true;
                this._startReport();
            }.bind(this));
        },

        _retrieveFileInfo: function(index, end, callback, filesArray) {
            filesArray = filesArray || [];
            if(index < end) {
                socketStatus.ready = false;
                DeviceMaster.fileInfo(
                    currentDirectoryContent.path,
                    currentDirectoryContent.files[index][0],
                    opts
                ).then(function(r) {
                    if(r.error) {
                        filesArray.push(currentDirectoryContent.files[index]);
                    }
                    else {
                        filesArray.push(r);
                    }

                    socketStatus.ready = true;
                    if(socketStatus.cancel) {
                        callback(filesArray);
                    }
                    else {
                        this._retrieveFileInfo(index + 1, end, callback, filesArray);
                    }

                }.bind(this));
            }
            else {
                callback(filesArray);
            }
        },

        _checkUSBFolderExistance: function() {
            var d = $.Deferred();
            var t = setInterval(function() {
                if(socketStatus.ready) {
                    clearInterval(t);
                    DeviceMaster.ls('USB').then(function(result) {
                        d.resolve(result.status === 'ok');
                    });
                }
            }, 200);
            return d.promise();
        },

        _displayFolderContent: function() {
            var self = this,
                files,
                folders,
                imgSrc,
                fileNameClass,
                folderNameClass;

            if(this.state.currentDirectoryFolders) {
                folders = this.state.currentDirectoryFolders.map(function(item) {
                    folderNameClass = ClassNames('name', {'selected': self.state.selectedItem === item});
                    return (
                        <div
                            className="folder"
                            onClick={self._handleHighlightFolder.bind(null, item)}
                            onDoubleClick={this._handleSelectFolder.bind(this, item)}>
                            <div className={folderNameClass}>{item}</div>
                        </div>
                    );
                }.bind(this));
            }

            if(this.state.currentDirectoryFiles) {
                files = this.state.currentDirectoryFiles.map(function(item, i) {
                    if(!item[0]) {
                        item = [currentDirectoryContent.files[i]];
                    }
                    imgSrc = URL.createObjectURL(item[1]) || '/img/ph_s.png';
                    fileNameClass = ClassNames('name', {'selected': self.state.selectedItem === item[0]});

                    return (
                        <div
                            title={item[0]}
                            className="file"
                            onClick={self._handleSelectFile.bind(null, item[0], DeviceConstants.SELECT)}
                            onDoubleClick={self._handleSelectFile.bind(null, item[0], DeviceConstants.PREVIEW)}>
                            <div className="image-wrapper">
                                <img src={imgSrc} onError={self._imageError.bind(this)}/>
                            </div>
                            <div className={fileNameClass}>
                                {item[0].length > fileNameLength ? item[0].substring(0, fileNameLength) + '...' : item[0]}
                            </div>
                        </div>
                    );
                });
            }

            return (
                <div className="wrapper" onClick={this._handleCancelSelectItem}>
                    {folders}
                    {files}
                </div>
            );
        },

        _imageError: function(src) {
            src.target.src = '/img/ph_s.png';
        },

        _renderCameraContent: function() {
            var backgroundStyle = {
                transition: 'all 0.5s',
                '-webkit-transition': 'all 0.5s',
                backgroundColor: '#E0E0E0',
                backgroundImage: 'url(' +this.state.cameraImageUrl + ')',
                backgroundSize: 'cover',
                backgroundPosition: '50% 50%',
                width: '100%',
                height: '100%'
            };
            return(
                <div className="wrapper" style={backgroundStyle}>
                </div>
            );
        },

        _renderSpinner: function() {
            return (
                <div className="spinner-wrapper">
                    <div className="spinner-flip"/>
                </div>
            );
        },

        _renderContent: function() {
            switch(this.state.mode) {
                case mode.PREVIEW:
                case mode.PRINT:
                    var divStyle = {
                            backgroundColor: '#E0E0E0',
                            backgroundImage: !previewUrl ? 'url(/img/ph_l.png)' : 'url(' + previewUrl + ')',
                            backgroundSize: 'cover',
                            backgroundPosition: '50% 50%',
                            width: '100%',
                            height: '100%'
                        };
                    return (<div style={divStyle} />);
                    break;

                case mode.BROWSE_FILE:
                    // console.log(this.state.directoryContent);
                    return this._processFolderContent();
                    break;

                case mode.CAMERA:
                    return this._renderCameraContent();
                    break;

                default:
                    return '';
                    break;
            }
        },

        _renderFolderContent: function() {
            // console.log('rendering folder content');
            switch(this.state.mode) {
                case mode.PREVIEW:
                case mode.PRINT:
                    var divStyle = {
                            backgroundColor: '#E0E0E0',
                            backgroundImage: !previewUrl ? 'url(/img/ph_l.png)' : 'url(' + previewUrl + ')',
                            backgroundSize: 'cover',
                            backgroundPosition: '50% 50%',
                            width: '100%',
                            height: '100%'
                        };
                    return (<div style={divStyle} />);
                    break;

                case mode.BROWSE_FILE:
                    return this._displayFolderContent();
                    break;

                case mode.CAMERA:
                    return this._renderCameraContent();
                    break;

                default:
                    return '';
                    break;
            }
        },

        _renderOperation: function() {
            var className;
            cameraClass = ClassNames('btn-camera btn-control', { 'on': this.state.mode === mode.CAMERA });
            cameraDescriptionClass = ClassNames('description', { 'on': this.state.mode === mode.CAMERA });

            go = function(enable) {
                className = ClassNames('controls center', {'disabled': !enable});
                return (
                <div className={className} onClick={this._handleGo}>
                    <div className="btn-go btn-control"></div>
                    <div className="description">{lang.monitor.go}</div>
                </div>
                );
            }.bind(this);

            pause = function(enable) {
                className = ClassNames('controls center', {'disabled': !enable});
                return (
                <div className={className} onClick={this._handlePause}>
                    <div className="btn-pause btn-control"></div>
                    <div className="description">{lang.monitor.pause}</div>
                </div>
                );
            }.bind(this);

            stop = function(enable) {
                className = ClassNames('controls left', {'disabled': !enable});
                return (
                <div className={className} onClick={this._handleStop}>
                    <div className="btn-stop btn-control"></div>
                    <div className="description">{lang.monitor.stop}</div>
                </div>
                );
            }.bind(this);

            upload = function(enable) {
                className = ClassNames('controls left', {'disabled': !enable});
                return (
                    <div className={className} onClick={this._handleUpload}>
                        <div className="btn-upload btn-control"></div>
                        <input className="upload-control" type="file" accept=".fc, .gcode" onChange={this._handleUpload} />
                        <div className="description">{lang.monitor.upload}</div>
                    </div>
                );
            }.bind(this);

            download =  function(enable) {
                className = ClassNames('controls center', {'disabled': !enable});
                return (
                    <div className={className} onClick={this._handleDownload}>
                        <div className="btn-download btn-control"></div>
                        <div className="description">{lang.monitor.download}</div>
                    </div>
                );
            }.bind(this);

            camera = function(enable) {
                className = ClassNames('controls right', {'disabled': !enable});
                return (
                    <div className={className} onClick={this._handleToggleCamera}>
                        <div className={cameraClass}></div>
                        <div className={cameraDescriptionClass}>{lang.monitor.camera}</div>
                    </div>
                );
            }.bind(this);

            preparing = function(enable) {
                className = ClassNames('controls center', {'disabled': true});
                return (
                <div className={className}>
                    <div className="btn-pause btn-control"></div>
                    <div className="description">{lang.monitor.pause}</div>
                </div>
                );
            }.bind(this);

            commands = {
                'READY': function() {
                    return go;
                },

                'RUNNING': function() {
                    return pause;
                },

                'STARTING': function() {
                    return preparing;
                },

                'PAUSED': function() {
                    return go;
                },

                'ABORTED': function() {
                    return go;
                },

                'HEATING': function() {
                    return preparing;
                },

                'CALIBRATING': function() {
                    return preparing;
                }
            };

            action = !!commands[this.state.currentStatus] ? commands[this.state.currentStatus]() : '';

            if(!this.props.fCode && !this.state.selectedItem) {
                if(this.state.currentStatus === DeviceConstants.READY) {
                    middleButtonOn = false;
                }
            }

            if(currentStatus !== DeviceConstants.READY) {
                rightButtonOn = false;
            }

            // CAMERA mode
            if(this.state.mode === mode.CAMERA) {
                leftButtonOn = false;
                middleButtonOn = false;
            }

            // BROWSE_FILE mode
            if(this.state.mode === mode.BROWSE_FILE) {
                leftButtonOn = pathArray.length > 0;
                middleButtonOn = this.state.selectedItemType === type.FILE;
            }

            // PRINT mode
            if(this.state.mode === mode.PRINT) {
                if(
                    statusId === DeviceConstants.status.IDLE ||
                    statusId === DeviceConstants.status.COMPLETED ||
                    statusId === DeviceConstants.status.ABORTED
                ) {
                    leftButtonOn = false;
                }

                if(this.state.currentStatus === DeviceConstants.STARTING) {
                    middleButtonOn = false;
                    rightButtonOn = false;
                }

                if(statusId === DeviceConstants.status.PAUSING_FROM_RUNNING) {
                    middleButtonOn = false;
                }

                if(statusId === DeviceConstants.status.MAINTAIN ||
                    statusId === DeviceConstants.status.SCAN ) {
                    middleButtonOn = false;
                }
            }
            else if (this.state.mode === mode.PREVIEW) {

                if(
                    statusId === DeviceConstants.status.IDLE ||
                    statusId === DeviceConstants.status.COMPLETED ||
                    statusId === DeviceConstants.status.ABORTED
                ) {
                    leftButtonOn = false;
                }

                if(statusId === DeviceConstants.status.PAUSED_FROM_RUNNING) {
                    leftButtonOn = true;
                }

                if(statusId === DeviceConstants.status.MAINTAIN ||
                   statusId === DeviceConstants.status.SCAN
                ) {
                    middleButtonOn = false;
                }
            }

            leftButton = this.state.mode === mode.BROWSE_FILE ? upload : stop;
            middleButton = this.state.mode === mode.BROWSE_FILE ? download : action;
            rightButton = camera;

            if(leftButton !== '') {
                leftButton = leftButton(leftButtonOn);
            }

            if(middleButton !== '') {
                middleButton = middleButton(middleButtonOn);
            }

            if(rightButton !== '') {
                rightButton = rightButton(rightButtonOn);
            }

            operation = (
                <div className="operation">
                    {leftButton}
                    {middleButton}
                    {rightButton}
                </div>
            );

            wait = (<div className="wait">{lang.monitor.connecting}</div>);

            return operation;
        },

        _renderPrintingInfo: function() {
            var _duration   = totalTimeInSeconds === 0 ? '' : formatDuration(totalTimeInSeconds),
                _progress   = percentageDone === 0 ? '' : percentageDone + '%',
                infoClass   = ClassNames(
                    'status-info',
                    {
                        'running':
                            this.state.mode === mode.BROWSE_FILE ||
                            this.state.mode === mode.PREVIEW && openSource === GlobalConstants.PRINT ||
                            this.state.mode === mode.PREVIEW && filePreview ||
                            statusId !== DeviceConstants.status.IDLE &&
                            statusId !== DeviceConstants.status.MAINTAIN &&
                            statusId !== DeviceConstants.status.SCAN
                    }
                );

            if(_duration === '' && this.props.slicingStatus) {
                var time = this.props.slicingStatus.time || 0;
                _duration = formatDuration(time);
            }

            if(statusId === DeviceConstants.status.IDLE || this._isAbortedOrCompleted()) {
                if(openSource !== GlobalConstants.PRINT && filePreview !== true) {
                    taskInfo = '';
                    _duration = '';
                    _progress = '';
                }

                if(taskInfo === '' && openSource) {
                    var f = {
                        'PRINT': function() {
                            return lang.monitor.task.EXTRUDER;
                        },
                        'LASER': function() {
                            return lang.monitor.task.LASER;
                        },
                        'DEVICE_LIST': function() {
                            return '';
                        }
                    };

                    if(!f[opener]) {
                        taskInfo = f[openSource]();
                    }
                }
            }

            if(!_duration && ! _progress) {
                infoClass = 'status-info';
            }

            return (
                <div className={infoClass}>
                    <div className="verticle-align">
                        <div>{taskInfo}</div>
                        <div className="status-info-duration">{_duration}</div>
                    </div>
                    <div className="status-info-progress">{_progress}</div>
                </div>
            );
        },

        _renderNavigation: function() {
            if(
                openSource === GlobalConstants.DEVICE_LIST &&
                statusId === 0 &&
                pathArray.length === 0 &&
                this.state.mode === mode.BROWSE_FILE
            ) {
                return (<div className="back"></div>);
            }
            if(history.length > 1) {
                return (
                   <div className="back" onClick={this._handleBack}>
                       <i className="fa fa-angle-left"></i>
                   </div>
               );
            }
            if(this.state.mode === mode.BROWSE_FILE) {
               return (
                   <div className="back" onClick={this._handleBack}>
                       <i className="fa fa-angle-left"></i>
                   </div>
               );
            }
            else {
                return (
                    <div className="back" onClick={this._handleBrowseFolder}>
                        <img src="../../img/folder.svg" />
                    </div>
                );
            }
        },

        render: function() {
            var name            = DeviceMaster.getSelectedDevice().name,
                // content         = this._renderContent(),
                content         = this._renderFolderContent(),
                waitIcon        = this.state.waiting ? this._renderSpinner() : '',
                op              = this._renderOperation(),
                navigation      = this._renderNavigation(),
                subClass        = ClassNames('sub', { 'hide': false }),
                printingInfo    = this.state.mode === mode.BROWSE_FILE ? '' : this._renderPrintingInfo();

            return (
                <div className="flux-monitor">
                    <div className="main">
                        <div className="header">
                            <div className="title">
                                <span>{name}</span>
                                <div className="close" onClick={this._handleClose}>
                                    <div className="x"></div>
                                </div>
                                {navigation}
                            </div>
                        </div>
                        <div className="body">
                            <div className="device-content" onScroll={this._handleScroll}>
                                {content}
                                {waitIcon}
                                {printingInfo}
                            </div>
                        </div>
                        {op}
                    </div>
                    <div className={subClass}>
                        <div className="wrapper">
                            <div className="row">
                                <div className="head-info">
                                    {headInfo}
                                </div>
                                <div className="status right">
                                    {this.state.displayStatus}
                                </div>
                            </div>
                            <div className="row">
                                <div className="temperature">{this.state.temperature}</div>
                                <div className="time-left right">{this.state.progress}</div>
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

    });
});
