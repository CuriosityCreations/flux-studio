define([
    'react',
    'jsx!widgets/Radio-Group',
    'jsx!widgets/Select'
], function(React, RadioGroupView, SelectView) {
    'use strict';

    return React.createClass({
        // UI events
        _onThresholdChanged: function(e) {
            this.props.onThresholdChanged(e, e.currentTarget.value);
        },

        _onTransform: function(e) {
            this.props.onTransform(e);
        },

        render: function() {
            var props = this.props,
                lang = props.lang,
                threshold = (
                    'engrave' === this.props.mode ?
                    <div className="controls">
                        <div className="control">
                            <label className="caption span4">{lang.laser.object_params.threshold.text}</label>
                            <input type="range" min="0" max="255" ref="threshold"
                                defaultValue={lang.laser.object_params.threshold.default}
                                onChange={this._onThresholdChanged}/>
                        </div>
                    </div> :
                    ''
                );

            return (
                <div className={props.className}>
                    <div className="controls">
                        <p className="control">
                            <label className="caption span4">{lang.laser.object_params.position.text}</label>
                            <input type="number" ref="objectPosX" step="1" data-type="x" className="span4" onChange={this._onTransform}/>
                            <input type="number" ref="objectPosY" step="1" data-type="y" className="span4" onChange={this._onTransform}/>
                        </p>
                        <p className="control">
                            <span className="offset-left-4 span4 text-center unit">X</span>
                            <span className="span4 text-center unit">Y</span>
                        </p>
                    </div>
                    <div className="controls">
                        <p className="control">
                            <label className="caption span4">{lang.laser.object_params.size.text}</label>
                            <input type="number" min="0" ref="objectSizeW" step="0.1" data-type="width" className="span4" onChange={this._onTransform}/>
                            <input type="number" min="0" ref="objectSizeH" step="0.1" data-type="height" className="span4" onChange={this._onTransform}/>
                        </p>
                        <p className="control">
                            <span className="offset-left-4 span4 text-center unit">{lang.laser.object_params.size.unit.width}</span>
                            <span className="span4 text-center unit">{lang.laser.object_params.size.unit.height}</span>
                        </p>
                    </div>
                    <div className="controls">
                        <p className="control">
                            <label className="caption span4">{lang.laser.object_params.rotate.text}</label>
                            <input type="number" min="0" max="360" ref="objectAngle" data-type="angle" className="span4" onChange={this._onTransform}/>
                        </p>
                    </div>
                    <div className="controls">
                        <div className="control">
                            <label className="caption span4">{lang.laser.object_params.unit.text}</label>
                            <RadioGroupView className="span8 radio-group" name="object-unit" ref="objectUnit" options={lang.laser.object_params.unit.options}/>
                        </div>
                    </div>
                    {threshold}
                </div>
            );
        },

        getDefaultProps: function() {
            return {
                onThresholdChanged: React.PropTypes.func,
                onTransform: React.PropTypes.func,
                mode: React.PropTypes.string
            };
        }

    });
});