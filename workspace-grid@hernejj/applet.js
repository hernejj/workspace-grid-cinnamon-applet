/*
 * This application is released under the GNU General Public License v2. A full
 * copy of the license can be found here: http://www.gnu.org/licenses/gpl.txt  
 * Thank you for using free software!
 *
 * Cinnamon 2D Workspace Grid (c) Jason J. Herne <hernejj@gmail.com> 2013
 */
const St = imports.gi.St;
const Lang = imports.lang;
const Applet = imports.ui.applet;
const Settings = imports.ui.settings;
const Clutter = imports.gi.Clutter;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;
const AppletDir = imports.ui.appletManager.applets['workspace-grid@hernejj'];
const WorkspaceController = AppletDir.WorkspaceController

function registerKeyBindings(registerUpDownKeyBindings) {
    try {
        if (registerUpDownKeyBindings) {
            Meta.keybindings_set_custom_handler('switch-to-workspace-up', Lang.bind(this, switchWorkspace));
            Meta.keybindings_set_custom_handler('switch-to-workspace-down', Lang.bind(this, switchWorkspace));
        }
        else {
            Meta.keybindings_set_custom_handler('switch-to-workspace-up', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
            Meta.keybindings_set_custom_handler('switch-to-workspace-down', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
        }
        Meta.keybindings_set_custom_handler('switch-to-workspace-left', Lang.bind(this, switchWorkspace));
        Meta.keybindings_set_custom_handler('switch-to-workspace-right', Lang.bind(this, switchWorkspace));
    }
    catch (e) {
        global.log("workspace-grid@hernejj: Registering keybindings failed!");
        global.logError("workspace-grid@hernejj exception: " + e.toString());
    }
}

function deregisterKeyBindings() {
    Meta.keybindings_set_custom_handler('switch-to-workspace-up', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
    Meta.keybindings_set_custom_handler('switch-to-workspace-down', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
    Meta.keybindings_set_custom_handler('switch-to-workspace-left', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
    Meta.keybindings_set_custom_handler('switch-to-workspace-right', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
}

function switchWorkspace(display, screen, window, binding) {
    let current_workspace_index = global.screen.get_active_workspace_index();

    if (binding.get_name() == 'switch-to-workspace-left')
        Main.wm.actionMoveWorkspaceLeft();
    else if (binding.get_name() == 'switch-to-workspace-right')
        Main.wm.actionMoveWorkspaceRight();
    else if (binding.get_name() == 'switch-to-workspace-up')
        Main.wm.actionMoveWorkspaceUp();
    else if (binding.get_name() == 'switch-to-workspace-down')
        Main.wm.actionMoveWorkspaceDown();
        
    if (current_workspace_index !== global.screen.get_active_workspace_index())
        Main.wm.showWorkspaceOSD();
}

function MyApplet(metadata, orientation, panel_height, instanceId) {
    this._init(metadata, orientation, panel_height, instanceId);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(metadata, orientation, panel_height, instanceId) {
        Applet.Applet.prototype._init.call(this, orientation, panel_height, instanceId);
        this.metadata = metadata;
        
        try {
            global.log("workspace-grid@hernejj: v0.6");
            this.button = [];
            this.actor.set_style_class_name("workspace-switcher-box");
            this.settings = new Settings.AppletSettings(this, "workspace-grid@hernejj", instanceId);
            this.settings.bindProperty(Settings.BindingDirection.IN, "numCols", "numCols", this.onUpdateNumberOfWorkspaces, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "numRows", "numRows", this.onUpdateNumberOfWorkspaces, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, "registerUpDownKeyBindings", "registerUpDownKeyBindings", this.onKeyBindingChanged, null);
            
            this.wscon = new WorkspaceController.WorkspaceController(this.numCols, this.numRows);
            
            this.rebuildWorkspaceSwitcher();
            this.onPanelEditModeChanged();
                        
            this.actor.connect('scroll-event', Lang.bind(this,this.onAppletScrollWheel));
            this.onNumWorkspacesChangedID = global.screen.connect('notify::n-workspaces', Lang.bind(this, this.numWorkspacesChanged));
            this.enable_numDesktopsChanged = true;
            
            global.settings.connect('changed::panel-edit-mode', Lang.bind(this, this.onPanelEditModeChanged));  
            global.window_manager.connect('switch-workspace', Lang.bind(this, this.updateWorkspaceSwitcher));
        }
        catch (e) {
            global.logError("workspace-grid@hernejj Main Applet Exception: " + e.toString());
        }
    },
    
    on_applet_added_to_panel: function () {
        registerKeyBindings(this.registerUpDownKeyBindings);
    },

    on_applet_removed_from_panel: function() {
        global.screen.disconnect(this.onNumWorkspacesChangedID);
        this.wscon.release_control();
        deregisterKeyBindings();
    },
    
    onKeyBindingChanged: function() {
        registerKeyBindings(this.registerUpDownKeyBindings);
    },
    
    onUpdateNumberOfWorkspaces: function() {
        this.enable_numDesktopsChanged = false;
        this.wscon.set_workspace_grid(this.numCols, this.numRows);
        this.enable_numDesktopsChanged = true;
        this.rebuildWorkspaceSwitcher();
    },
    
    numDesktopsChanged: function() {
        // If this desktop was added external to this applet, then numRows and numCols
        // are not updated to reflect its existence. This is bad! We can detect this case
        // and correct it by removing the additional desktop
        if (this.numRows*this.numCols < global.screen.n_workspaces && this.enable_numDesktopsChanged ) {
            this.enable_numDesktopsChanged = false;
            this.wscon.__equalize_num_workspaces();
            this.enable_numDesktopsChanged = true;
        }

        this.rebuildWorkspaceSwitcher();
    },
 
    onPanelEditModeChanged: function() {
        let reactive = !global.settings.get_boolean('panel-edit-mode');
        for (let i=0; i < this.button.length; ++i)
            this.button[i].reactive = reactive;            
    }, 
    
    onAppletScrollWheel: function(actor, event){
        var idx = global.screen.get_active_workspace_index();

        if (event.get_scroll_direction() == 0) idx--; 
        else if (event.get_scroll_direction() == 1) idx++;
        
        if(global.screen.get_workspace_by_index(idx) != null)
                global.screen.get_workspace_by_index(idx).activate(global.get_current_time());
    },

    onRowIndicatorClicked: function(actor, event) {
        if ( event.get_button() != 1 ) return false;
        
        let curws_idx = global.screen.get_active_workspace_index();
        let curws_row = Math.floor(curws_idx/this.numCols);
        let [x, y] = event.get_coords();
        let [wx, wy] = actor.get_transformed_position();
        let [w, h] = actor.get_size();
        y -= wy;

        let clicked_row = Math.floor(this.numRows*y/h);
        clicked_idx = (clicked_row * this.numCols) + (curws_idx % this.numCols);

        global.screen.get_workspace_by_index(clicked_idx).activate(global.get_current_time());        
        return true;
    },

    onWorkspaceButtonClicked: function(actor, event) {
        if ( event.get_button() != 1 ) return false;
        global.screen.get_workspace_by_index(actor.index).activate(global.get_current_time());
    },

    on_panel_height_changed: function() {
        this.rebuildWorkspaceSwitcher();
    },

    rebuildWorkspaceSwitcher: function() {
        this.actor.destroy_all_children();

        if (this.numRows > 1) {
            this.row_indicator = new St.DrawingArea({ reactive: true });
            this.row_indicator.set_width(this._panelHeight/1.75);
            this.row_indicator.connect('repaint', Lang.bind(this, this.draw_row_indicator));
            this.row_indicator.connect('button-press-event', Lang.bind(this, this.onRowIndicatorClicked));
            this.actor.add(this.row_indicator);
        }

        this.button = [];
        for ( let i=0; i<global.screen.n_workspaces; ++i ) {
            this.button[i] = new St.Button({ name: 'workspaceButton', style_class: 'workspace-button', reactive: true });
            
            let text = (i+1).toString();
            let label = new St.Label({ text: text });
            label.set_style("font-weight: bold");
            this.button[i].set_child(label);
            this.actor.add(this.button[i]);
            this.button[i].index = i;
            this.button[i].set_height(this._panelHeight);
            this.button[i].set_width(this._panelHeight*1.25);
            this.button[i].connect('button-release-event', Lang.bind(this, this.onWorkspaceButtonClicked));
        }
        this.updateWorkspaceSwitcher();
    },

    updateWorkspaceSwitcher: function() {
        let nworks = this.button.length;
        let active_ws = global.screen.get_active_workspace_index();
        let active_row = Math.floor(active_ws/this.numCols);
        let low = (active_row)*this.numCols;
        let high = low + this.numCols;

        for (let i=0; i < nworks; ++i) {
            if (i >= low && i < high) this.button[i].show();
            else this.button[i].hide();
                
            if (i == active_ws) {
                this.button[i].get_child().set_text((i+1).toString());
                this.button[i].add_style_pseudo_class('outlined');
            }
            else {
                this.button[i].get_child().set_text((i+1).toString());
                this.button[i].remove_style_pseudo_class('outlined');
            }
        }
        
        if ( this.row_indicator )
            this.row_indicator.queue_repaint();
    },
    
    draw_row_indicator: function(area) {
        let [width, height] = area.get_surface_size();
        let themeNode = this.row_indicator.get_theme_node();
        let cr = area.get_context();
        
        let base_color = this.get_base_color()
        let active_color = null;
        let inactive_color = null;
        
        if (this.is_theme_light_on_dark()) {
            active_color = base_color.lighten();
            inactive_color = base_color.darken();
        }
        else {
            active_color = base_color.darken().darken();
            inactive_color = base_color.lighten().lighten();
        }
           
        let active = global.screen.get_active_workspace_index();
        let active_row = Math.floor(active/this.numCols);

        for ( let i=0; i < this.numRows; ++i ) {
            let y = (i+1)*height/(this.numRows+1);
            let endx = (width / 10) * 9
            cr.moveTo(0, y);
            cr.lineTo(endx, y);
            let color = active_row == i ? active_color : inactive_color;
            Clutter.cairo_set_source_color(cr, color);
            cr.setLineWidth(2.0);
            cr.stroke();
        }
    },
    
    is_theme_light_on_dark: function() {
        let selected_idx = global.screen.get_active_workspace_index();
        let unselected_idx = 0;
        if (unselected_idx == selected_idx) unselected_idx = 1;
        
        let selected_txt_color = this.button[selected_idx].get_theme_node().get_color('color');
        let unselected_txt_color = this.button[unselected_idx].get_theme_node().get_color('color');

        let sel_avg = (selected_txt_color.red + selected_txt_color.green + selected_txt_color.blue)/3;
        let unsel_avg = (unselected_txt_color.red + unselected_txt_color.green + unselected_txt_color.blue)/3;
        return (sel_avg < unsel_avg);
    },
    
    // All colors we use in this applet are based on this theme defined color.
    // We simply grab the color of a normal, non-outlined workspae button.
    get_base_color: function() {
        let unselected_idx = 0;
        if (unselected_idx == global.screen.get_active_workspace_index()) unselected_idx = 1;
        return this.button[unselected_idx].get_theme_node().get_color('color');
    },
};

function main(metadata, orientation, panel_height, instanceId) {  
    let myApplet = new MyApplet(metadata, orientation, panel_height, instanceId);
    return myApplet;
}
