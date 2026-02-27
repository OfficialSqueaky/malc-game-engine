/**
 * MALC Game Engine Library
 * Version: 1.0.2
 * Description: A comprehensive 2D game engine for p5.js
 */

(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module
        define(['p5'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // Node. Does not work with strict CommonJS
        module.exports = factory(require('p5'));
    } else {
        // Browser globals (root is window)
        root.MALC = factory(root.p5);
    }
}(typeof self !== 'undefined' ? self : this, function(p5) {

// Store reference to p5 instance
const _p5 = p5;

// ========== GLOBAL ARRAYS ==========
const MALCgameObjects = [];
const MALCbuttons = [];
const MALCScene = [];
var UIPlanes = [];
var buttonsToggled = true;

// ========== GRAVITY CONSTANTS ==========
const GRAVITY = 0.5;
const TERMINAL_VELOCITY = 20;

// ========== HELPER FUNCTIONS ==========
function getTimestamp() {
    return new Date().getTime();
}

function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========== SCENE CLASS (DEFINED FIRST) ==========
class Scene {
    static scenes = [];
    static activeScene = "blank";
    static started = false;
    static sceneHistory = [];
    static historyLimit = 10;

    static update() {
        this.started = true;
        this.scenes = MALCScene;
        
        let activeSceneFound = false;
        
        this.scenes.forEach(S => {
            if (S.id == this.activeScene) {
                activeSceneFound = true;
                
                this.scenes.forEach(s => {
                    if (s != S) {
                        s._active = false;
                        s.active = false;
                        
                        s.objects.forEach(o => {
                            if (o && typeof o.active !== 'undefined') o.active = false;
                        });
                    }
                });
                
                S.active = true;
                
                if (!S._active) {
                    S.activated = MALC.time.getTime();
                    if (typeof S.onActivate == 'function') S.onActivate();
                }
                
                S._active = true;
                S.timeActive = MALC.time.getTime() - S.activated;
                
                S.objects.forEach(o => {
                    if (o && typeof o.active !== 'undefined') o.active = true;
                });
                
                _p5.prototype.push();
                if (window.camera && typeof camera.render == 'function') {
                    camera.render();
                }
                
                S.render();
                
                _p5.prototype.pop();
            }
        });
        
        if (!activeSceneFound && this.activeScene != "blank") {
            console.warn(`Scene "${this.activeScene}" not found, switching to blank`);
            this.activeScene = "blank";
        }
    }
    
    static getSceneById(id) {
        return MALCScene.find(scene => scene.id == id) || null;
    }
    
    static getActiveScene() {
        return this.getSceneById(this.activeScene);
    }
    
    static switchToScene(id, addToHistory = true) {
        let scene = this.getSceneById(id);
        if (scene) {
            if (addToHistory && this.activeScene) {
                this.sceneHistory.push(this.activeScene);
                if (this.sceneHistory.length > this.historyLimit) {
                    this.sceneHistory.shift();
                }
            }
            this.activeScene = id;
        } else {
            console.error(`Cannot switch to scene "${id}" - not found`);
        }
    }
    
    static goBack() {
        if (this.sceneHistory.length > 0) {
            let previousScene = this.sceneHistory.pop();
            this.switchToScene(previousScene, false);
            return true;
        }
        return false;
    }
    
    static getAllScenes() {
        return [...MALCScene];
    }
    
    static getScenesWithObject(object) {
        return MALCScene.filter(scene => scene.objects.includes(object));
    }
    
    static getScenesByTag(tag) {
        return MALCScene.filter(scene => scene.hasTag(tag));
    }

    constructor(id, backgroundColor, ...scripts) {
        MALCScene.forEach(s => {
            if (s.id == id || typeof id != "string") {
                throw new Error(`Scenes must have unique IDs and be strings. Duplicate/Invalid ID: "${id}"`);
            }
        });
        
        this.id = id;
        this.backColor = backgroundColor;
        this.scripts = scripts;
        
        this.objects = [];
        this.uiPlanes = [];
        
        this.active = false;
        this._active = false;
        this.activated = 0;
        this.timeActive = -1;
        
        this.tags = [];
        this.paused = false;
        this.transition = null;
        this.onActivateCallbacks = [];
        this.onDeactivateCallbacks = [];
        this.onUpdateCallbacks = [];
        
        this.sceneInstance = MALCScene.length;
        MALCScene.push(this);
    }
    
    render() {
        if (this.paused) return;
        
        if (this.transition) {
            this.applyTransition();
        }
        
        _p5.prototype.background(this.backColor);
        
        this.scripts.forEach(exe => {
            if (typeof exe == "function") exe(this);
        });
        
        this.onUpdateCallbacks.forEach(cb => {
            if (typeof cb == "function") cb(this);
        });
        
        this.objects.forEach(o => {
            if (o && typeof o.update == "function") {
                o.update(true);
            }
            if (o && typeof o.render == "function") {
                o.render();
            }
        });
        
        if (typeof UIPlanes !== 'undefined' && UIPlanes.length > 0) {
            UIPlanes.forEach(ui => {
                if (ui && typeof ui.belongsToScene == "function" && ui.belongsToScene(this.id)) {
                    ui.render();
                }
            });
        }
        
        this.uiPlanes.forEach(ui => {
            if (ui && typeof ui.render == "function") {
                ui.render();
            }
        });
        
        MALCScene[this.sceneInstance] = this;
    }
    
    applyTransition() {
        if (!this.transition || !this.transition.active) return;
        
        this.transition.progress += 1/60;
        
        if (this.transition.progress >= this.transition.duration) {
            this.transition.active = false;
            this.transition = null;
            return;
        }
        
        let t = this.transition.progress / this.transition.duration;
        
        _p5.prototype.push();
        switch(this.transition.type) {
            case "fade":
                _p5.prototype.fill(0, 255 * (1 - t));
                _p5.prototype.rect(0, 0, _p5.prototype.width, _p5.prototype.height);
                break;
            case "slide":
                _p5.prototype.translate(_p5.prototype.width * (1 - t), 0);
                break;
        }
        _p5.prototype.pop();
    }
    
    addObject(object) {
        if (object && !this.objects.includes(object)) {
            this.objects.push(object);
            if (typeof object.addToScene == "function") {
                object.addToScene(this.id);
            }
        }
        return this;
    }
    
    addObjects(objects) {
        objects.forEach(obj => this.addObject(obj));
        return this;
    }
    
    removeObject(object) {
        this.objects = this.objects.filter(obj => obj != object);
        if (object && typeof object.removeFromScene == "function") {
            object.removeFromScene(this.id);
        }
        return this;
    }
    
    clearObjects() {
        this.objects.forEach(obj => {
            if (obj && typeof obj.removeFromScene == "function") {
                obj.removeFromScene(this.id);
            }
        });
        this.objects = [];
        return this;
    }
    
    getObjects(filter) {
        if (typeof filter == "function") {
            return this.objects.filter(filter);
        } else if (filter == "button") {
            return this.objects.filter(obj => obj instanceof Button);
        } else if (filter == "gameObject") {
            return this.objects.filter(obj => obj instanceof gameObject);
        }
        return this.objects;
    }
    
    getObjectById(id) {
        return this.objects.find(obj => obj && obj.id == id);
    }
    
    addUIPlane(uiPlane) {
        if (uiPlane && !this.uiPlanes.includes(uiPlane)) {
            this.uiPlanes.push(uiPlane);
            if (typeof uiPlane.addToScene == "function") {
                uiPlane.addToScene(this.id);
            }
        }
        return this;
    }
    
    removeUIPlane(uiPlane) {
        this.uiPlanes = this.uiPlanes.filter(ui => ui != uiPlane);
        if (uiPlane && typeof uiPlane.removeFromScene == "function") {
            uiPlane.removeFromScene(this.id);
        }
        return this;
    }
    
    clearUIPlanes() {
        this.uiPlanes.forEach(ui => {
            if (ui && typeof ui.removeFromScene == "function") {
                ui.removeFromScene(this.id);
            }
        });
        this.uiPlanes = [];
        return this;
    }
    
    addScript(script) {
        if (typeof script == "function" && !this.scripts.includes(script)) {
            this.scripts.push(script);
        }
        return this;
    }
    
    removeScript(script) {
        this.scripts = this.scripts.filter(s => s != script);
        return this;
    }
    
    clearScripts() {
        this.scripts = [];
        return this;
    }
    
    onActivate(callback) {
        if (typeof callback == "function") {
            this.onActivateCallbacks.push(callback);
        }
        return this;
    }
    
    onDeactivate(callback) {
        if (typeof callback == "function") {
            this.onDeactivateCallbacks.push(callback);
        }
        return this;
    }
    
    onUpdate(callback) {
        if (typeof callback == "function") {
            this.onUpdateCallbacks.push(callback);
        }
        return this;
    }
    
    pause() {
        this.paused = true;
        return this;
    }
    
    resume() {
        this.paused = false;
        return this;
    }
    
    setTransition(type, duration = 1.0) {
        this.transition = {
            type: type,
            duration: duration,
            progress: 0,
            active: true
        };
        return this;
    }
    
    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
        }
        return this;
    }
    
    removeTag(tag) {
        this.tags = this.tags.filter(t => t != tag);
        return this;
    }
    
    hasTag(tag) {
        return this.tags.includes(tag);
    }
    
    reset() {
        this.clearObjects();
        this.clearUIPlanes();
        this.clearScripts();
        this.onActivateCallbacks = [];
        this.onDeactivateCallbacks = [];
        this.onUpdateCallbacks = [];
        this.tags = [];
        this.paused = false;
        this.transition = null;
        this.timeActive = 0;
        return this;
    }
    
    destroy() {
        let index = MALCScene.indexOf(this);
        if (index > -1) {
            MALCScene.splice(index, 1);
        }
        
        this.clearObjects();
        this.clearUIPlanes();
        
        if (Scene.activeScene == this.id) {
            Scene.activeScene = "blank";
        }
    }
    
    clone(newId) {
        let clone = new Scene(newId || this.id + "_copy", this.backColor, ...this.scripts);
        clone.objects = [...this.objects];
        clone.uiPlanes = [...this.uiPlanes];
        clone.tags = [...this.tags];
        return clone;
    }
    
    getInfo() {
        return {
            id: this.id,
            active: this.active,
            timeActive: this.timeActive,
            objectCount: this.objects.length,
            uiPlaneCount: this.uiPlanes.length,
            scriptCount: this.scripts.length,
            tags: this.tags,
            paused: this.paused
        };
    }
}

// ========== GAME OBJECT CLASS WITH GRAVITY ==========
class gameObject {
    static objects = [];
    static started = false;
    static gravity = GRAVITY;
    static terminalVelocity = TERMINAL_VELOCITY;
    
    static render() {
        MALCgameObjects.forEach(o => {
            if (o.active) o.render();
        });
    }
    
    static update() {
        this.started = true;
        this.objects = MALCgameObjects;
        
        // Update all active objects
        MALCgameObjects.forEach(o => {
            if (o.active) o.update();
        });
    }

    static initialize() {
        console.log("MALC gameObjects initialized");
        
        // Add objects to their scenes
        MALCgameObjects.forEach(o => {
            o.scenes.forEach(sceneId => {
                let scene = Scene.getSceneById(sceneId);
                if (scene && !scene.objects.includes(o)) {
                    scene.objects.push(o);
                }
            });
        });
    }
    
    static getObjectByIndex(index) {
        return MALCgameObjects[index] || null;
    }
    
    static getActiveObjects() {
        return MALCgameObjects.filter(o => o.active);
    }
    
    static getObjectsInScene(sceneId) {
        let scene = Scene.getSceneById(sceneId);
        return scene ? scene.objects : [];
    }
    
    static setGlobalGravity(value) {
        this.gravity = value;
    }
    
    static getGlobalGravity() {
        return this.gravity;
    }

    constructor(x = 0, y = 0, w = 20, h = 20, ...scenes) {
        this.id = generateId('gameObject');
        this.x = x;
        this.y = y;
        this.width = w;
        this.height = h;
        this.rotation = 0;
        this.rotationMode = "degrees";
        this.velocity = [0, 0];
        this.velocityMatrix = [0, 0];
        this.velocityMode = "polar";
        this.rvm = "unlinked";
        
        // Gravity properties
        this.gravity = {
            enabled: false,
            velocity: 0,
            grounded: false,
            groundTolerance: 1, // pixels
            mass: 1,
            bounce: 0, // 0 = no bounce, 1 = full bounce
            friction: 0.1 // ground friction
        };
        
        this.formatting = {
            outline: [false, 0, "black"],
            color: "white",
        };
        
        this.collition = true;
        
        this.scripts = [];
        this.scenes = scenes.length < 1 ? ["blank"] : [...new Set(scenes)];
        this.active = false;
        this.visible = true;
        this.parentScene = null;
        
        this.debug = false;
        this.hitbox = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            rotation: 0,
            parts: null,
            outline: 1,
        };
        
        this.objectInstance = MALCgameObjects.length;
        this.lastGroundY = y;
        
        MALCgameObjects.push(this);
    }
    
    // Enable gravity for this object
    enableGravity() {
        this.gravity.enabled = true;
        return this;
    }
    
    // Disable gravity for this object
    disableGravity() {
        this.gravity.enabled = false;
        this.gravity.velocity = 0;
        return this;
    }
    
    // Set gravity parameters
    setGravity(options = {}) {
        if (options.enabled !== undefined) this.gravity.enabled = options.enabled;
        if (options.mass !== undefined) this.gravity.mass = Math.max(0.1, options.mass);
        if (options.bounce !== undefined) this.gravity.bounce = Math.min(1, Math.max(0, options.bounce));
        if (options.friction !== undefined) this.gravity.friction = Math.min(1, Math.max(0, options.friction));
        if (options.groundTolerance !== undefined) this.gravity.groundTolerance = options.groundTolerance;
        return this;
    }
    
    // Apply gravity to this object
    applyGravity() {
        if (!this.gravity.enabled) return;
        
        // Apply gravity acceleration (scaled by mass)
        this.gravity.velocity += gameObject.gravity * this.gravity.mass;
        
        // Limit to terminal velocity
        this.gravity.velocity = Math.min(this.gravity.velocity, gameObject.terminalVelocity);
        
        // Store last position before moving
        let lastY = this.y;
        
        // Apply vertical movement
        this.y += this.gravity.velocity;
        
        // Check for ground collision with other objects
        this.checkGroundCollision();
        
        // If we just landed, stop downward velocity
        if (this.gravity.grounded) {
            this.gravity.velocity = 0;
            
            // Apply ground friction to horizontal movement
            if (this.gravity.friction > 0 && this.velocityMode === "polar") {
                this.velocity[0] *= (1 - this.gravity.friction);
                if (Math.abs(this.velocity[0]) < 0.01) this.velocity[0] = 0;
            }
        }
    }
    
    // Check if this object is standing on another object
    checkGroundCollision() {
        if (!this.collition || !this.gravity.enabled) return;
        
        let wasGrounded = this.gravity.grounded;
        this.gravity.grounded = false;
        
        // Check collision with other objects in the same scene
        if (this.parentScene && this.parentScene.objects) {
            this.parentScene.objects.forEach(other => {
                // Skip self and inactive objects
                if (other.id === this.id || !other.active) return;
                
                // Only check if gravity is enabled on this object and we're moving downward
                if (this.gravity.velocity <= 0) return;
                
                // Check if other object is below this one
                let verticalDistance = (other.y - other.height/2) - (this.y + this.height/2);
                
                // If within ground tolerance and horizontally overlapping
                if (Math.abs(verticalDistance) <= this.gravity.groundTolerance &&
                    this.x + this.width/2 > other.x - other.width/2 &&
                    this.x - this.width/2 < other.x + other.width/2) {
                    
                    this.gravity.grounded = true;
                    this.lastGroundY = other.y - other.height/2 - this.height/2;
                    
                    // Apply bounce if enabled
                    if (this.gravity.bounce > 0 && wasGrounded === false) {
                        this.gravity.velocity = -this.gravity.velocity * this.gravity.bounce;
                        
                        // If bounce velocity is very small, just set to zero
                        if (Math.abs(this.gravity.velocity) < 0.1) {
                            this.gravity.velocity = 0;
                        }
                    } else {
                        // Position exactly on ground
                        this.y = this.lastGroundY;
                    }
                }
            });
        }
    }
    
    update() {
        if (!this.active) return;
        
        // Apply gravity if enabled
        this.applyGravity();
        
        let vel = this.velocity[0];
        let angle = this.velocity[1];
        
        if (this.velocityMode == "polar") {
            let linked = false;
            if (!/unlinked/i.test(this.rvm) && /linked/i.test(this.rvm)) {
                this.velocity[1] = this.rotation;
                linked = true;
            }

            let rot = linked ? 
                (this.rotationMode == "degrees" ? (this.rotation) : _p5.prototype.radians(this.rotation)) : 
                (this.rotationMode == "degrees" ? (this.velocity[1]) : (this.velocity[1]));
            
            if(isNaN(rot)){
                vel = 0;
                rot = 0;
            }
            
            let vx = vel * _p5.prototype.cos(rot);
            let vy = vel * _p5.prototype.sin(rot);

            this.velocityMatrix = [vx, vy];
            
            // Don't apply horizontal movement if gravity is enabled and we're grounded with friction
            if (!(this.gravity.enabled && this.gravity.grounded && this.gravity.friction > 0)) {
                this.x += vx;
            }
            
            // Vertical movement is handled by gravity when enabled
            if (!this.gravity.enabled) {
                this.y += vy;
            }
        } else {
            // Cartesian velocity mode
            if (!(this.gravity.enabled && this.gravity.grounded && this.gravity.friction > 0)) {
                this.x += vel;
            }
            if (!this.gravity.enabled) {
                this.y += angle;
            }
        }
        
        // Update parent scene reference
        this.updateParentScene();
        
        MALCgameObjects[this.objectInstance] = this;
    }
    
    render() {
        if (!this.active) return;
        
        this.scripts.forEach(s => {
            if(typeof s == "function")s(this);
        });
        
        let outline = this.formatting.outline;
        let hb = this.hitbox;
        
        // Draw debug hitbox if enabled
        if (this.debug) {
            _p5.prototype.push();
            _p5.prototype.translate(this.x, this.y);
            _p5.prototype.rectMode(_p5.prototype.CENTER);
            if (this.rotationMode == "degrees") _p5.prototype.angleMode(_p5.prototype.DEGREES);
            _p5.prototype.rotate(this.rotation + hb.rotation);

            _p5.prototype.stroke("#00FF27");
            _p5.prototype.strokeWeight(hb.outline);
            _p5.prototype.noFill();
            _p5.prototype.rect(hb.x, hb.y, this.width + hb.width, this.height + hb.height);
            
            // Draw gravity indicator if enabled
            if (this.gravity.enabled) {
                _p5.prototype.stroke(0, 255, 0, 100);
                _p5.prototype.line(0, 0, 0, this.gravity.velocity * 5);
            }
            
            _p5.prototype.pop();
        }
        
        if (!this.visible) return;
        
        _p5.prototype.push();
        _p5.prototype.translate(this.x, this.y);
        _p5.prototype.rectMode(_p5.prototype.CENTER);
        if (this.rotationMode == "degrees") _p5.prototype.angleMode(_p5.prototype.DEGREES);
        _p5.prototype.rotate(this.rotation);
        
        if (outline[0]) {
            _p5.prototype.strokeWeight(outline[1]);
            _p5.prototype.stroke(outline[2]);
        } else {
            _p5.prototype.noStroke();
        }
        
        _p5.prototype.fill(this.formatting.color);
        _p5.prototype.rect(0, 0, this.width, this.height);
        _p5.prototype.pop();
    }

    // ========== HELPFUL METHODS ==========
    
    belongsToScene(sceneId) {
        return this.scenes.includes(sceneId);
    }
    
    addToScene(sceneId) {
        if (!this.scenes.includes(sceneId)) {
            this.scenes.push(sceneId);
            let scene = Scene.getSceneById(sceneId);
            if (scene && !scene.objects.includes(this)) {
                scene.objects.push(this);
            }
        }
        return this;
    }
    
    removeFromScene(sceneId) {
        this.scenes = this.scenes.filter(id => id != sceneId);
        let scene = Scene.getSceneById(sceneId);
        if (scene) {
            scene.objects = scene.objects.filter(obj => obj != this);
        }
        return this;
    }
    
    removeFromAllScenes() {
        this.scenes.forEach(sceneId => {
            let scene = Scene.getSceneById(sceneId);
            if (scene) {
                scene.objects = scene.objects.filter(obj => obj != this);
            }
        });
        this.scenes = [];
        return this;
    }
    
    updateParentScene() {
        if (Scene.activeScene) {
            let activeScene = Scene.getSceneById(Scene.activeScene);
            if (activeScene && this.belongsToScene(activeScene.id)) {
                this.parentScene = activeScene;
            }
        }
    }
    
    distanceTo(target) {
        let dx = target.x !== undefined ? target.x - this.x : target[0] - this.x;
        let dy = target.y !== undefined ? target.y - this.y : target[1] - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    collidesWith(other) {
        return (this.x < other.x + other.width &&
                this.x + this.width > other.x &&
                this.y < other.y + other.height &&
                this.y + this.height > other.y);
    }
    
    directionTo(x, y, err = 0.5) {
        let pa = [x - this.x, y - this.y];
        
        let angle = (x && y) ? _p5.prototype.atan(pa[1]/pa[0]) : this.rotation;
        var quads = [
            pa[0] < -err && pa[1] > err,
            pa[0] < -err && pa[1] < -err,
            pa[0] > err && pa[1] > err,
            pa[0] > err && pa[1] < -err,
            (pa[0] < err && pa[0] > -err),
            (pa[1] < err && pa[1] > -err),
        ];
        
        let da = (_p5.prototype.atan(pa[1]/pa[0]) * 180)/Math.PI;
        
        if((pa[1] > -err && pa[1] < err) && (pa[0] > -err && pa[0] < err)){
            angle = NaN;
        } else if(quads[0]){
            angle = da+180;
        } else if(quads[1]){
            angle = da+180;
        } else if(quads[2]){
            angle = da;
        } else if(quads[3]){
            angle = da;
        } else if(quads[4]){
            if(pa[1] < -err) {
                angle = -90;
            } else if(pa[1] > err) {
                angle = 90;
            }
        } else if(quads[5]){
            if(pa[0] < -err) {
                angle = 180;
            } else if(pa[0] > err) {
                angle = 0;
            }
        }
        
        return angle;
    }
    
    pointTo(target) {
        this.rotation = this.directionTo(target);
        return this;
    }
    
    setPosition(x, y) {
        this.x = x;
        this.y = y;
        return this;
    }
    
    move(dx, dy) {
        this.x += dx;
        this.y += dy;
        return this;
    }
    
    setVelocity(speed, x, y, err = 0.5){
        let angle = this.directionTo(x,y,err);
        
        if(isNaN(angle)){
            angle = 0;
            speed = 0;
        }
        
        this.velocity = [speed, angle]; 
        return this.velocity;
    }
    
    destroy() {
        this.removeFromAllScenes();
        let index = MALCgameObjects.indexOf(this);
        if (index > -1) {
            MALCgameObjects.splice(index, 1);
        }
    }
    
    clone() {
        let clone = new gameObject(this.x, this.y, this.width, this.height, ...this.scenes);
        clone.rotation = this.rotation;
        clone.rotationMode = this.rotationMode;
        clone.velocity = [...this.velocity];
        clone.velocityMode = this.velocityMode;
        clone.rvm = this.rvm;
        clone.formatting = JSON.parse(JSON.stringify(this.formatting));
        clone.gravity = JSON.parse(JSON.stringify(this.gravity));
        clone.debug = this.debug;
        clone.hitbox = JSON.parse(JSON.stringify(this.hitbox));
        return clone;
    }

    screenToWorld(screenX, screenY) {
        if (window.camera && typeof camera.screenToWorld == "function") {
            return camera.screenToWorld(screenX, screenY);
        }
        return { x: screenX, y: screenY };
    }
    
    isOnScreen() {
        if (!window.camera) return true;
        
        let cameraPos = camera.getOrientation();
        let screenRight = cameraPos[0] + camera.width;
        let screenBottom = cameraPos[1] + camera.height;
        
        return (this.x + this.width/2 > cameraPos[0] &&
                this.x - this.width/2 < screenRight &&
                this.y + this.height/2 > cameraPos[1] &&
                this.y - this.height/2 < screenBottom);
    }
}

// ========== BUTTON CLASS ==========
class Button extends gameObject {
    static buttons = [];
    
    static updateButton() {
        this.startedButtons = true;
        this.buttons = MALCbuttons;
        
        this.buttons.forEach(b => {
            if (!b.active) return;
            
            b.isHovered = b.events.hover();
            
            if (MALCbuttons.every(b => !b.events.hover())) {
                _p5.prototype.cursor();
            } else if (b.isHovered) {
                _p5.prototype.cursor(b.cursor);
            }
        });
    }
    
    static getButtonByIndex(index) {
        return MALCbuttons[index] || null;
    }
    
    static getHoveredButton() {
        return MALCbuttons.find(b => b.active && b.events.hover());
    }
    
    static getPressedButton() {
        return MALCbuttons.find(b => b.active && b.events.pressed());
    }
    
    constructor(x = 0, y = 0, w = 20, h = 20, displayText = "Button", ...scenes) {
        super(x, y, w, h, ...scenes);
        
        this.formatting.button = {
            hover: 220,
            clicked: 190,
            text: {
                color: 0,
                size: 14,
                style:"normal",
                display: displayText,
            },
            colors: {
                normal: 255,
                hover: 220,
                pressed: 190,
                disabled: 150
            }
        };
        
        this.cursor = "pointer";
        this.isHovered = false;
        this.isPressed = false;
        this.isDisabled = false;
        this.clickCooldown = 100;
        this.lastClickTime = 0;
        this.cooldownActive = false;
        
        this.events = {
            hover: (err = 0) => {
                return !this.isDisabled && (
                    window.mouse.x < this.x + this.width / 2 + err &&
                    window.mouse.x > this.x - (this.width / 2 + err) &&
                    window.mouse.y < this.y + this.height / 2 + err &&
                    window.mouse.y > this.y - (this.height / 2 + err)
                );
            },
            pressed: () => {
                return this.events.hover() && window.mouse.down;
            },
            clicked: () => {
                let wasPressed = this.wasPressed;
                let isHovering = this.events.hover();
                let mouseReleased = !window.mouse.down && wasPressed;

                this.wasPressed = window.mouse.down && isHovering;

                return mouseReleased && isHovering;
            }
        };

        this.wasPressed = false;
        this.onClick = null;
        
        this.buttonIndex = MALCbuttons.length;
        MALCbuttons.push(this);
    }

    update(boolean) {
        super.update(boolean);

        if (this.cooldownActive) {
            let currentTime = Date.now();
            if (currentTime - this.lastClickTime >= this.clickCooldown) {
                this.cooldownActive = false;
            }
        }

        this.isHovered = this.events.hover();
        this.isPressed = this.events.pressed();

        if (this.events.clicked() && this.onClick && !this.isDisabled && !this.cooldownActive) {
            this.onClick(this);
            this.lastClickTime = Date.now();
            this.cooldownActive = true;
        }

        MALCbuttons[this.buttonIndex] = this;
    }

    render() {
        if (!this.active) return;
        
        let btnFormat = this.formatting.button;
        let buttonColor;
        
        if (this.isDisabled) {
            buttonColor = btnFormat.colors.disabled;
        } else if (this.isPressed) {
            buttonColor = btnFormat.colors.pressed;
        } else if (this.isHovered) {
            buttonColor = btnFormat.colors.hover;
        } else {
            buttonColor = btnFormat.colors.normal;
        }
        
        let originalColor = this.formatting.color;
        this.formatting.color = buttonColor;
        
        super.render();
        
        if(!this.visible) return;
        
        _p5.prototype.push();
        _p5.prototype.translate(this.x, this.y);
        if (this.rotationMode == "degrees") _p5.prototype.angleMode(_p5.prototype.DEGREES);
        _p5.prototype.rotate(this.rotation);
        
        _p5.prototype.textStyle(btnFormat.text.style);
        _p5.prototype.textSize(btnFormat.text.size);
        _p5.prototype.fill(btnFormat.text.color);
        _p5.prototype.coloredText(btnFormat.text.display, 0, 0, _p5.prototype.CENTER, _p5.prototype.CENTER);
        _p5.prototype.pop();
        
        this.formatting.color = originalColor;
    }
    
    // ========== BUTTON-SPECIFIC HELPER METHODS ==========
    
    setText(text) {
        this.formatting.button.text.display = text;
        return this;
    }
    
    getRGBFromColor(colorInput) {
        let c = _p5.prototype.color(colorInput);
        return [_p5.prototype.red(c), _p5.prototype.green(c), _p5.prototype.blue(c)];
    }
    
    getBrightness(colorInput) {
        let rgb = this.getRGBFromColor(colorInput);
        return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    }
    
    scaleColor(baseColor, scaleFactor) {
        let rgb = this.getRGBFromColor(baseColor);
        let scaledRGB = rgb.map(val => _p5.prototype.constrain(val * scaleFactor, 0, 255));
        return _p5.prototype.color(scaledRGB);
    }
    
    setColors(normal, hover = null, pressed = null, disabled = null) {
        if (hover === null && pressed === null) {
            let originalNormal = this.formatting.button.colors.normal;
            let originalHover = this.formatting.button.colors.hover;
            let originalPressed = this.formatting.button.colors.pressed;
            
            let normalBrightness = this.getBrightness(originalNormal);
            let hoverBrightness = this.getBrightness(originalHover);
            let pressedBrightness = this.getBrightness(originalPressed);
            
            let hoverScale = normalBrightness !== 0 ? hoverBrightness / normalBrightness : 0.86;
            let pressedScale = normalBrightness !== 0 ? pressedBrightness / normalBrightness : 0.75;
            
            hover = this.scaleColor(normal, hoverScale);
            pressed = this.scaleColor(normal, pressedScale);
        } else {
            hover = _p5.prototype.color(hover);
            pressed = _p5.prototype.color(pressed);
        }
        
        let normalColor = _p5.prototype.color(normal);
        let disabledColor = disabled !== null ? _p5.prototype.color(disabled) : null;
        
        this.formatting.button.colors.normal = normalColor;
        this.formatting.button.colors.hover = hover;
        this.formatting.button.colors.pressed = pressed;
        if (disabledColor !== null) {
            this.formatting.button.colors.disabled = disabledColor;
        }
        
        return this;
    }
    
    textStyle(color, size) {
        if (color !== undefined) this.formatting.button.text.color = color;
        if (size !== undefined) this.formatting.button.text.size = size;
        return this;
    }
    
    Disable(disabled = true) {
        this.isDisabled = disabled;
        return this;
    }
    
    click(call) {
        if(typeof call == "function" && this.events.pressed()){
            call();
        }
        return this.events.clicked();
    }
}

// ========== UIPLANE CLASS ==========
class UIPlane {
    constructor(executable, formatting = [], ...scenes) {
        this.executable = executable;
        
        this.formatting = {
            txt: {
                title: 24,
                heading: 22,
                subtitle: 20,
                base: 16,
                color: 255,
            },
            objectScale: 1,
            orientation: ["camera", 0, 0],
        };
        
        this._formatting = {
            txt: {
                title: 24,
                heading: 22,
                subtitle: 20,
                base: 16,
                color: 255,
            },
            objectScale: 1,
            orientation: ["camera", 0, 0],
        };
        
        if (formatting.length > 0) {
            this.applyFormatting(formatting);
        }
        
        this.scenes = (scenes.length < 1) ? ["blank"] : [...new Set(scenes)];
        this.active = false;
        this.id = generateId('uiPlane');
        
        this.uiIndex = UIPlanes.length;
        
        this.scenes.forEach(s => {
            let scene = Scene.getSceneById(s);
            if (scene) scene.addUIPlane(this);
        });
        
        UIPlanes.push(this);
    }
    
    applyFormatting(formattingArray) {
        if (!Array.isArray(formattingArray)) {
            console.log(new Error("Formatting is invalid format. Input must be an array!"));
            return;
        }
        
        formattingArray.forEach(f => {
            if (typeof f == "string") {
                this.parseStringFormat(f);
            } else if (typeof f == "number") {
                this.parseNumberFormat(f, formattingArray);
            }
        });
    }
    
    parseStringFormat(formatString) {
        let parts = formatString.split("!");
        if (parts.length < 2) return;
        
        let leftParts = parts[0].split(":");
        let valueType = leftParts[0].toLowerCase();
        let valueKey = leftParts.length > 1 ? leftParts[1].toLowerCase() : null;

        let rightParts = parts[1].split("|");
        let operator = rightParts[0].toLowerCase();
        let value = rightParts.length > 1 ? rightParts[1] : null;

        if (valueType === "txt") {
            if (valueKey && this.formatting.txt.hasOwnProperty(valueKey)) {
                let numValue = Number(value);
                if (isNaN(numValue)) return;

                if (operator === "set") {
                    this.formatting.txt[valueKey] = numValue;
                } else if (operator === "add") {
                    this.formatting.txt[valueKey] += numValue;
                } else if (operator === "scale") {
                    this.formatting.txt[valueKey] *= numValue;
                } else if (operator === "default") {
                    this.formatting.txt[valueKey] = this._formatting.txt[valueKey];
                }
            } else if (valueKey === "all") {
                let numValue = Number(value);
                if (isNaN(numValue)) return;

                Object.keys(this.formatting.txt).forEach(key => {
                    if (operator === "set") {
                        this.formatting.txt[key] = numValue;
                    } else if (operator === "add") {
                        this.formatting.txt[key] += numValue;
                    } else if (operator === "scale") {
                        this.formatting.txt[key] *= numValue;
                    }
                });
            }
        } else if (valueType === "orientation") {
            if (!value) return;

            try {
                let values = JSON.parse(`[${value}]`);

                if (operator === "set") {
                    if (values.length >= 1 && typeof values[0] == "string") {
                        this.formatting.orientation[0] = values[0];
                    }
                    if (values.length >= 2 && typeof values[1] == "number") {
                        this.formatting.orientation[1] = values[1];
                    }
                    if (values.length >= 3 && typeof values[2] == "number") {
                        this.formatting.orientation[2] = values[2];
                    }
                } else if (operator === "add") {
                    if (values.length >= 2) this.formatting.orientation[1] += values[1];
                    if (values.length >= 3) this.formatting.orientation[2] += values[2];
                } else if (operator === "scale") {
                    if (values.length >= 2) this.formatting.orientation[1] *= values[1];
                    if (values.length >= 3) this.formatting.orientation[2] *= values[2];
                }
            } catch (e) {
                console.log(new Error("Formatting Error: Invalid orientation format"));
            }
        } else if (valueType === "scale") {
            let numValue = Number(value);
            if (isNaN(numValue)) return;

            if (operator === "set") {
                this.formatting.objectScale = numValue;
            } else if (operator === "add") {
                this.formatting.objectScale += numValue;
            } else if (operator === "mult") {
                this.formatting.objectScale *= numValue;
            }
        } else if (valueType === "color" && valueKey) {
            const colorMap = {
                "red": 0xFF0000,
                "green": 0x00FF00, 
                "blue": 0x0000FF,
                "white": 0xFFFFFF,
                "black": 0x000000,
                "yellow": 0xFFFF00,
                "cyan": 0x00FFFF,
                "magenta": 0xFF00FF
            };

            let colorValue;
            if (colorMap.hasOwnProperty(value)) {
                colorValue = colorMap[value];
            } else {
                colorValue = Number(value);
                if (isNaN(colorValue)) return;
            }

            if (operator === "set") {
                if (valueKey === "txt") {
                    this.formatting.txt.color = colorValue;
                } else if (valueKey === "bg") {
                    if (!this.formatting.bg) this.formatting.bg = {};
                    this.formatting.bg.color = colorValue;
                }
            }
        }
    }
    
    parseNumberFormat(number, fullArray) {
        let index = fullArray.indexOf(number);
        
        if (index < 5) {
            let keys = ["title", "heading", "subtitle", "base", "color"];
            if (keys[index]) {
                this.formatting.txt[keys[index]] = number;
            }
        } else if (index == 5) {
            this.formatting.objectScale = number;
        } else if (index == 6) {
            if (typeof fullArray[index] == "string") {
                this.formatting.orientation[0] = fullArray[index];
            }
        } else if (index == 7) {
            if (typeof fullArray[index] == "number") {
                this.formatting.orientation[1] = number;
            }
        } else if (index == 8) {
            if (typeof fullArray[index] == "number") {
                this.formatting.orientation[2] = number;
            }
        }
    }
    
    render() {
        _p5.prototype.push();
        
        this.applyOrientation();
        this.applyTextFormatting();
        
        if (this.formatting.objectScale !== 1) {
            _p5.prototype.scale(this.formatting.objectScale);
        }
        
        if (typeof this.executable == "function") {
            this.executable(this);
        }
        
        _p5.prototype.pop();
    }
    
    applyOrientation() {
        let [mode, offsetX, offsetY] = this.formatting.orientation;
        
        if (mode.toLowerCase() == "camera") {
            if (window.camera) {
                let cameraPos;
                if (typeof window.camera.getOrientation == "function") {
                    cameraPos = window.camera.getOrientation();
                } else {
                    cameraPos = [window.camera.x || 0, window.camera.y || 0];
                }
                _p5.prototype.translate(cameraPos[0] + offsetX, cameraPos[1] + offsetY);
            } else {
                _p5.prototype.translate(offsetX, offsetY);
            }
        } else if (mode.toLowerCase() == "screen") {
            _p5.prototype.translate(offsetX, offsetY);
        } else if (mode.includes(",")) {
            try {
                let coords = mode.split(",").map(Number);
                if (coords.length >= 2) {
                    if (window.camera && typeof window.camera.worldToScreen == "function") {
                        let screenPos = window.camera.worldToScreen(coords[0], coords[1]);
                        _p5.prototype.translate(screenPos.x + offsetX, screenPos.y + offsetY);
                    } else {
                        _p5.prototype.translate(coords[0] + offsetX, coords[1] + offsetY);
                    }
                }
            } catch (e) {
                console.log(new Error("Formatting Error: Invalid orientation coordinates"));
            }
        }
    }
    
    applyTextFormatting() {
        _p5.prototype.textSize(this.formatting.txt.base);
        _p5.prototype.fill(this.formatting.txt.color);
        _p5.prototype.textAlign(_p5.prototype.LEFT, _p5.prototype.TOP);
    }
    
    drawText(str, x, y, hAlign = LEFT, vAlign = TOP) {
        _p5.prototype.push();
        
        if (str.startsWith("[title]")) {
            _p5.prototype.textSize(this.formatting.txt.title);
            str = str.replace("[title]", "");
        } else if (str.startsWith("[heading]")) {
            _p5.prototype.textSize(this.formatting.txt.heading);
            str = str.replace("[heading]", "");
        } else if (str.startsWith("[subtitle]")) {
            _p5.prototype.textSize(this.formatting.txt.subtitle);
            str = str.replace("[subtitle]", "");
        } else {
            _p5.prototype.textSize(this.formatting.txt.base);
        }
        
        _p5.prototype.fill(this.formatting.txt.color);
        _p5.prototype.textAlign(hAlign, vAlign);
        _p5.prototype.text(str, x, y);
        
        _p5.prototype.pop();
    }
    
    drawButton(button, x, y) {
        _p5.prototype.push();
        
        if (this.formatting.objectScale !== 1) {
            _p5.prototype.scale(this.formatting.objectScale);
        }
        
        if (button && typeof button.render == "function") {
            button.render();
        }
        
        _p5.prototype.pop();
    }
    
    belongsToScene(sceneId) {
        return this.scenes.includes(sceneId) || this.scenes.includes("blank");
    }
    
    addToScene(sceneId) {
        if (!this.scenes.includes(sceneId)) {
            this.scenes.push(sceneId);
        }
        return this;
    }
    
    removeFromScene(sceneId) {
        this.scenes = this.scenes.filter(id => id != sceneId);
        return this;
    }
    
    addToScenes(sceneIds) {
        sceneIds.forEach(id => this.addToScene(id));
        return this;
    }
    
    removeFromAllScenes() {
        this.scenes = [];
        return this;
    }
    
    resetFormatting() {
        this.formatting = JSON.parse(JSON.stringify(this._formatting));
        return this;
    }
    
    setTextStyle(property, value) {
        if (this.formatting.txt.hasOwnProperty(property)) {
            this.formatting.txt[property] = value;
        }
        return this;
    }
    
    setOrientation(mode, offsetX = 0, offsetY = 0) {
        this.formatting.orientation = [mode, offsetX, offsetY];
        return this;
    }
    
    setScale(scale) {
        this.formatting.objectScale = scale;
        return this;
    }
    
    destroy() {
        this.removeFromAllScenes();
        let index = UIPlanes.indexOf(this);
        if (index > -1) {
            UIPlanes.splice(index, 1);
        }
    }
    
    clone() {
        let clone = new UIPlane(
            this.executable,
            [...this.scenes],
            ...this.scenes
        );
        clone.formatting = JSON.parse(JSON.stringify(this.formatting));
        return clone;
    }
}

// ========== CAMERA CLASS ==========
class Camera {
    constructor(canvasX, canvasY) {
        this.x = canvasX/2;
        this.y = canvasY/2;
        this.position = [CENTER, CENTER];
        this.width = canvasX;
        this.height = canvasY;
        this.offsetX = 0;
        this.offsetY = 0;
        this.targetObject = null;
    }
    
    getOrientation() {
        let topLeftX = this.x;
        let topLeftY = this.y;
        
        if (this.position[0] == CENTER) {
            topLeftX = this.x - this.width / 2;
        } else if (this.position[0] == RIGHT) {
            topLeftX = this.x - this.width;
        }
        
        if (this.position[1] == CENTER) {
            topLeftY = this.y - this.height / 2;
        } else if (this.position[1] == BOTTOM) {
            topLeftY = this.y - this.height;
        }
        
        return [topLeftX, topLeftY];
    }
    
    link(object, offsetX = 0, offsetY = 0) {
        if (!Number(object.x) && !Number(object.y)) {
            console.log(new Error(`TypeError: camera.link parameter must be an object that contains x, y values!`));
            return;
        }
        
        this.targetObject = object;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        
        this.updatePosition();
    }
    
    updatePosition() {
        if (!this.targetObject) return;
        
        let objX = this.targetObject.x;
        let objY = this.targetObject.y;
        
        if (this.position[0] == LEFT) {
            this.x = objX - this.offsetX - this.width/2;
        } else if (this.position[0] == CENTER) {
            this.x = objX - this.offsetX;
        } else if (this.position[0] == RIGHT) {
            this.x = objX - this.offsetX + this.width/2;
        }
        
        if (this.position[1] == TOP) {
            this.y = objY - this.offsetY - this.height/2;
        } else if (this.position[1] == CENTER) {
            this.y = objY - this.offsetY;
        } else if (this.position[1] == BOTTOM) {
            this.y = objY - this.offsetY + this.height/2;
        }
    }
    
    setOffset(offsetX, offsetY) {
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.updatePosition();
    }
    
    render() {
        if (this.targetObject) {
            this.updatePosition();
        }
        
        let [translateX, translateY] = this.getOrientation();
        _p5.prototype.translate(-translateX, -translateY);
    }
    
    unlink() {
        this.targetObject = null;
        this.offsetX = 0;
        this.offsetY = 0;
    }
    
    worldToScreen(worldX, worldY) {
        let [topLeftX, topLeftY] = this.getOrientation();
        return {
            x: worldX - topLeftX,
            y: worldY - topLeftY
        };
    }
    
    screenToWorld(screenX, screenY) {
        let [topLeftX, topLeftY] = this.getOrientation();
        return {
            x: screenX + topLeftX,
            y: screenY + topLeftY
        };
    }
}

// ========== MOUSE HANDLER ==========
class MouseHandler {
    constructor() {
        this.mouse = {
            x: 0,
            y: 0,
            rawX:0,
            rawY:0,
            pressed: false,
            button: null,
            clicked: false,
            doubleClicked: false,
            lastClickTime: 0,
            clickCount: 0,
            pressedButtons: new Set(),
            dragStart: { x: 0, y: 0, active: false },
            dragDelta: { dx: 0, dy: 0 },
            wheel: { deltaX: 0, deltaY: 0, deltaZ: 0 },
            insideCanvas: false
        };
        
        this.buttonMap = {
            0: 'left',
            1: 'middle',
            2: 'right'
        };
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        window.addEventListener('click', (e) => this.handleClick(e));
        window.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
        window.addEventListener('contextmenu', (e) => e.preventDefault());
        window.addEventListener('wheel', (e) => this.handleWheel(e));
        window.addEventListener('mouseenter', (e) => this.handleMouseEnter(e));
        window.addEventListener('mouseleave', (e) => this.handleMouseLeave(e));
    }
    
    handleMouseMove(e) {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        
        if (this.mouse.pressed) {
            this.mouse.dragStart.active = true;
            this.mouse.dragDelta = {
                dx: this.mouse.x - this.mouse.dragStart.x,
                dy: this.mouse.y - this.mouse.dragStart.y
            };
        }
        
        if (window.p5 && p5.instance) {
            p5.instance._onmousemove(e);
        }
    }
    
    handleMouseDown(e) {
        this.mouse.pressed = true;
        this.mouse.button = e.button;
        this.mouse.pressedButtons.add(e.button);
        this.mouse.dragStart = {
            x: this.mouse.x,
            y: this.mouse.y,
            active: false
        };
        this.mouse.dragDelta = { dx: 0, dy: 0 };
        
        if (window.p5 && p5.instance) {
            p5.instance._onmousedown(e);
        }
    }
    
    handleMouseUp(e) {
        this.mouse.pressed = false;
        this.mouse.pressedButtons.delete(e.button);
        
        if (this.mouse.dragStart.active) {
            this.mouse.dragStart.active = false;
        }
        
        if (window.p5 && p5.instance) {
            p5.instance._onmouseup(e);
        }
    }
    
    handleClick(e) {
        this.mouse.clicked = true;
        this.mouse.clickCount++;
        
        const currentTime = Date.now();
        if (currentTime - this.mouse.lastClickTime < 300) {
            this.mouse.doubleClicked = true;
        }
        this.mouse.lastClickTime = currentTime;
        
        setTimeout(() => {
            this.mouse.clicked = false;
            this.mouse.doubleClicked = false;
        }, 100);
        
        if (window.p5 && p5.instance) {
            p5.instance._onclick(e);
        }
    }
    
    handleDoubleClick(e) {
        this.mouse.doubleClicked = true;
        
        if (window.p5 && p5.instance) {
            p5.instance._ondblclick(e);
        }
    }
    
    handleWheel(e) {
        this.mouse.wheel = {
            deltaX: e.deltaX,
            deltaY: e.deltaY,
            deltaZ: e.deltaZ
        };
        
        if (window.p5 && p5.instance) {
            p5.instance._onwheel(e);
        }
    }
    
    handleMouseEnter(e) {
        this.mouse.insideCanvas = true;
    }
    
    handleMouseLeave(e) {
        this.mouse.insideCanvas = false;
        
        if (this.mouse.dragStart.active) {
            this.mouse.dragStart.active = false;
            this.mouse.dragDelta = { dx: 0, dy: 0 };
        }
    }
    
    getMousePosition() {
        return { x: this.mouse.x, y: this.mouse.y };
    }
    
    isInsideCanvas() {
        return this.mouse.insideCanvas;
    }
    
    isMousePressed(button = null) {
        if (button !== null) {
            if (typeof button === 'string') {
                const buttonIndex = this.getButtonIndex(button);
                return this.mouse.pressedButtons.has(buttonIndex);
            }
            return this.mouse.pressedButtons.has(button);
        }
        return this.mouse.pressed;
    }
    
    getPressedButton() {
        if (this.mouse.button !== null) {
            return {
                index: this.mouse.button,
                name: this.buttonMap[this.mouse.button] || 'unknown'
            };
        }
        return null;
    }
    
    getPressedButtons() {
        const buttons = [];
        this.mouse.pressedButtons.forEach(buttonIndex => {
            buttons.push({
                index: buttonIndex,
                name: this.buttonMap[buttonIndex] || 'unknown'
            });
        });
        return buttons;
    }
    
    wasMouseClicked() {
        return this.mouse.clicked;
    }
    
    wasMouseDoubleClicked() {
        return this.mouse.doubleClicked;
    }
    
    getClickCount() {
        return this.mouse.clickCount;
    }
    
    isDragging() {
        return this.mouse.dragStart.active && this.mouse.pressed;
    }
    
    getDragDelta() {
        return { ...this.mouse.dragDelta };
    }
    
    getDragStartPosition() {
        if (this.mouse.dragStart.active) {
            return {
                x: this.mouse.dragStart.x,
                y: this.mouse.dragStart.y
            };
        }
        return null;
    }
    
    getWheelDelta() {
        return { ...this.mouse.wheel };
    }
    
    wasWheelScrolled() {
        return this.mouse.wheel.deltaY !== 0 || 
               this.mouse.wheel.deltaX !== 0 || 
               this.mouse.wheel.deltaZ !== 0;
    }
    
    getMouseVelocity() {
        if (!this.mouse.prevX) {
            this.mouse.prevX = this.mouse.x;
            this.mouse.prevY = this.mouse.y;
            return { vx: 0, vy: 0 };
        }
        
        const velocity = {
            vx: this.mouse.x - this.mouse.prevX,
            vy: this.mouse.y - this.mouse.prevY
        };
        
        this.mouse.prevX = this.mouse.x;
        this.mouse.prevY = this.mouse.y;
        
        return velocity;
    }
    
    getButtonIndex(buttonName) {
        const buttonMap = {
            'left': 0,
            'middle': 1,
            'right': 2,
            'back': 3,
            'forward': 4
        };
        return buttonMap[buttonName.toLowerCase()] ?? -1;
    }
    
    reset() {
        this.mouse.pressed = false;
        this.mouse.button = null;
        this.mouse.clicked = false;
        this.mouse.doubleClicked = false;
        this.mouse.pressedButtons.clear();
        this.mouse.dragStart.active = false;
        this.mouse.dragDelta = { dx: 0, dy: 0 };
        this.mouse.wheel = { deltaX: 0, deltaY: 0, deltaZ: 0 };
    }
}

// ========== KEYBOARD HANDLER ==========
class KeyboardHandler {
    constructor(){
        this.keys = {};
        this.modifiers = {
            shift: false,
            ctrl: false,
            alt: false,
            meta: false
        };
        
        this.keyTyped = "";
        this.typedBuffer = "";
        
        this.shiftSymbolMap = {
            '`': '~', '1': '!', '2': '@', '3': '#', '4': '$', '5': '%',
            '6': '^', '7': '&', '8': '*', '9': '(', '0': ')', '-': '_',
            '=': '+', '[': '{', ']': '}', '\\': '|', ';': ':', "'": '"',
            ',': '<', '.': '>', '/': '?'
        };
        
        this.nonTypingKeys = [
            'shift', 'control', 'alt', 'meta', 'escape', 'tab', 'capslock',
            'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'enter', 'backspace',
            'delete', 'home', 'end', 'pageup', 'pagedown', 'insert', 'f1', 'f2', 
            'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'
        ];
    }
    
    keyPressed(){
        let returner = [];
        let keys = arguments;
        
        let keysLength = Object.keys(this.keys).length;
        
        if(keysLength < 1) return false;
        
        if(arguments.length == 0){
            for (const [key, value] of Object.entries(this.keys)) {
                if(value.pressed) returner.push(value);
            }
        } else if(arguments.length == 1){
            returner = (this.keys[arguments[0]] != undefined) ? this.keys[arguments[0]].pressed : false;
        } else {
            for(let a in arguments){
                let arg = arguments[a];
                
                if(typeof this.keys[arg] == "object") returner.push(this.keys[arg].pressed);
                else returner.push(undefined);
            }
            
            returner = returner.every(k => k == true);
        }
        
        return returner;
    }
    
    getKey(k){
        if(!this.keys[k]) return;
        return this.keys[k];
    }
    
    held(k){
        if(!this.keys[k]) return;
        let key = this.keys[k];
        if(key.timeStamp.pressed > key.timeStamp.released) {
            return (new Date().getTime() - key.timeStamp.pressed)/1000;
        }
        return (key.timeStamp.released - key.timeStamp.pressed)/1000;
    }
    
    getTypedChar(key) {
        if (!key || key.length === 0) return '';
        
        const lowerKey = key.toLowerCase();
        
        if (this.nonTypingKeys.includes(lowerKey)) {
            return '';
        }
        
        if (lowerKey.match(/[a-z]/)) {
            const shiftPressed = this.isShiftPressed();
            return shiftPressed ? key.toUpperCase() : key.toLowerCase();
        }
        
        if (this.isShiftPressed() && this.shiftSymbolMap[key]) {
            return this.shiftSymbolMap[key];
        }
        
        return key;
    }
    
    isShiftPressed() {
        for (const [keyCode, keyData] of Object.entries(this.keys)) {
            if (keyData.modifiers && keyData.modifiers.shift) {
                return true;
            }
        }
        return false;
    }
    
    typed(key = null, clearAfter = true) {
        if (key !== null) {
            const typedChar = this.getTypedChar(key);
            if (typedChar) {
                this.typedBuffer += typedChar;
            }
            return typedChar;
        }
        
        const buffer = this.typedBuffer;
        if (clearAfter) {
            this.clearTypedBuffer();
        }
        return buffer;
    }
    
    clearTypedBuffer() {
        this.typedBuffer = "";
    }
    
    backspace() {
        this.typedBuffer = this.typedBuffer.slice(0, -1);
    }
    
    enter() {
        this.typedBuffer += '\n';
    }
    
    getTypedBuffer() {
        return this.typedBuffer;
    }
}

// ========== KEYBOARD EVENT LISTENERS ==========
const keyboard = new KeyboardHandler();

window.addEventListener('keydown', (e) => {
    const key = e.key;
    const lowerKey = key.toLowerCase();
    
    let ck = keyboard.keys[lowerKey];
    let keyObject;
    
    if(ck != undefined){
        if(!ck.pressed) ck.timeStamp.pressed = new Date().getTime();
        ck.pressed = true;
        ck.modifiers = {
            shift: e.shiftKey,
            ctrl: e.ctrlKey,
            alt: e.altKey,
            meta: e.metaKey,
        };
        keyObject = ck;
    } else {
        keyObject = {
            key: lowerKey,
            originalKey: key,
            modifiers:{
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                alt: e.altKey,
                meta: e.metaKey,
            },
            held: e.repeat,
            pressed: true,
            timeStamp:{
                pressed: new Date().getTime(),
                released: -1,
            },
        };
    }
    
    keyboard.keys[lowerKey] = keyObject;
    
    if (!e.ctrlKey && !e.altKey && !e.metaKey && key.length === 1) {
        keyboard.typed(key, false);
    } else {
        if (lowerKey === 'backspace') {
            keyboard.backspace();
        } else if (lowerKey === 'enter') {
            keyboard.enter();
        }
    }
});

window.addEventListener('keyup', (e) => {
    const lowerKey = e.key.toLowerCase();
    
    let ck = keyboard.keys[lowerKey];
    let keyObject;
    
    if(ck != undefined){
        if(ck.pressed) ck.timeStamp.released = new Date().getTime();
        ck.pressed = false;
        ck.modifiers = {
            shift: false,
            ctrl: false,
            alt: false,
            meta: false,
        };
        keyObject = ck;
    } else {
        keyObject = {
            key: lowerKey,
            modifiers:{
                shift: e.shiftKey,
                ctrl: e.ctrlKey,
                alt: e.altKey,
                meta: e.metaKey,
            },
            held: e.repeat,
            pressed: false,
            timeStamp:{
                pressed: -1,
                released: new Date().getTime(),
            },
        };
    }
    
    keyboard.keys[lowerKey] = keyObject;
});

window.addEventListener('blur', (e) => {
    for(let K in keyboard.keys){
        let k = keyboard.keys[K];
        k.pressed = false;
        k.timeStamp.released = new Date().getTime();
        k.modifiers = {
            shift: false,
            ctrl: false,
            alt: false,
            meta: false,
        };
    }
});

// ========== CONTROLLER HANDLER ==========
class GameController {
    constructor() {
        this.index = 0;
        this.buttons = [];
        this.axes = [];
        this.connected = false;
        this.id = "";
        
        this.binds = {
          select: null,
          back: null,
          primary: null,
          secondary: null,
          leftbumber: null,
          rightbumber: null,
          lefttrigger: null,
          righttrigger: null,
          view: null,
          menu: null,
          leftstick: null,
          rightstick: null,
          up: null,
          down: null,
          left: null,
          right: null,
          home: null,
      };
        
        this.setupListeners();
    }

    setupListeners() {
        window.addEventListener("gamepadconnected", (e) => {
            console.log("Controller connected:", e.gamepad);
            this.updateController(e.gamepad);
        });

        window.addEventListener("gamepaddisconnected", (e) => {
            console.log("Controller disconnected");
            this.connected = false;
        });
    }

    update() {
        const gamepads = navigator.getGamepads();
        if (gamepads[this.index]) {
            this.updateController(gamepads[this.index]);
        }
        
        for(let b in this.binds){
            let tester = this.getButton(b);
            
            if(tester != false && tester.value != 0 && typeof this.binds[b] == "function") {
                this.binds[b]();
            }
        }
    }

    updateController(gp) {
        this.connected = true;
        this.id = gp.id;
        this.buttons = gp.buttons.map(b => ({
            pressed: b.pressed,
            value: b.value
        }));
        this.axes = [...gp.axes];
    }

    isButtonPressed(buttonIndex) {
        return this.buttons[buttonIndex]?.pressed || false;
    }

    getButtonValue(buttonIndex) {
        return this.buttons[buttonIndex]?.value || 0;
    }

    getAxis(axisIndex) {
        if(typeof axisIndex == "number") {
            return this.axes[axisIndex] || 0;
        } else if(typeof axisIndex == "string"){
            if(/left/gi.test(axisIndex)) {
                return {x: this.axes[0], y: this.axes[1]};
            }
            if(/right/gi.test(axisIndex)) {
                return {x: this.axes[2], y: this.axes[3]};
            }
        }
    }

    getButton(name){
        name = name.toLowerCase();

        // Handle common variations
        const buttonMap = {
            // Primary button names
            'select': 0, 'back': 1, 'primary': 2, 'secondary': 3,
            'home': 16,

            // Bumpers (with common variations)
            'leftbumper': 4, 'leftbumber': 4, 'lb': 4,
            'rightbumper': 5, 'rightbumber': 5, 'rb': 5,

            // Triggers
            'lefttrigger': 6, 'lt': 6,
            'righttrigger': 7, 'rt': 7,

            // System buttons
            'view': 8, 'menu': 9,

            // Stick clicks
            'leftstick': 10, 'l3': 10,
            'rightstick': 11, 'r3': 11,

            // D-Pad
            'up': 12, 'down': 13, 'left': 14, 'right': 15
        };

        const btn = buttonMap[name];

        if(btn == undefined) {
            throw new Error(`Controller|TypeError: "${name}" isn't a valid button mapping getter!`);
        }

        return this.buttons[btn]?.pressed || false;
    }
}

const controller = new GameController();

// ========== FPS TRACKER ==========
const fpsTimes = [];
let fps;

function refreshLoop() {
    window.requestAnimationFrame(() => {
        const now = performance.now();
        while (fpsTimes.length > 0 && fpsTimes[0] <= now - 1000) {
            fpsTimes.shift();
        }
        fpsTimes.push(now);
        fps = fpsTimes.length;
        refreshLoop();
    });
}

// ========== COLORED TEXT FUNCTION ==========
p5.prototype._parseColoredText = function(str) {
    const lines = str.split('\n');
    const result = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const parts = this._parseColoredLine(line);
        
        result.push(...parts);
        
        if (i < lines.length - 1) {
            result.push({
                text: '\n',
                color: null,
                isNewline: true
            });
        }
    }
    
    return result;
};

p5.prototype._parseColoredLine = function(str) {
    const regex = /\\([^|\\\n]+)\|([^|]+)\|/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = regex.exec(str)) !== null) {
        if (match.index > lastIndex) {
            parts.push({
                text: str.substring(lastIndex, match.index),
                color: null
            });
        }
        
        parts.push({
            text: match[2],
            color: match[1]
        });
        
        lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < str.length) {
        parts.push({
            text: str.substring(lastIndex),
            color: null
        });
    }
    
    return parts.length ? parts : [{ text: str, color: null }];
};

p5.prototype.coloredText = function(str, x, y, horizontal = LEFT, vertical = BASELINE, maxWidth) {
    const parts = this._parseColoredText(str);
    let currentX = x;
    let currentY = y;
    
    const originalFill = this.drawingContext.fillStyle;
    const originalAlign = this.drawingContext.textAlign;
    const originalBaseline = this.drawingContext.textBaseline;
    
    this.textAlign(horizontal, vertical);
    
    for (const part of parts) {
        if (part.isNewline) {
            currentX = x;
            currentY += this.textLeading() || this.textSize() * 1.2;
            continue;
        }
        
        if (part.color) {
            try {
                this.fill(part.color);
            } catch (e) {
                this.fill(originalFill);
            }
        }
        
        this.text(part.text, currentX, currentY, maxWidth);
        currentX += this.textWidth(part.text);
    }
    
    this.fill(originalFill);
    if (originalAlign && originalBaseline) {
        this.drawingContext.textAlign = originalAlign;
        this.drawingContext.textBaseline = originalBaseline;
    }
    
    return this;
};

// ========== FPS ACCESSOR ==========
function getFPS() {
    return fps;
}

// ========== HELP SYSTEM ==========
const helpDocs = {
    // Game Engine Overview
    overview: `
        MALC Game Engine - A comprehensive 2D game engine for p5.js
        Version: 1.0.1
        
        Core Features:
        - Scene management system
        - GameObject class with physics (position, velocity, rotation)
        - Gravity system with collision detection
        - Interactive Button class
        - UI Plane system for HUD elements
        - Camera system with object tracking
        - Mouse, Keyboard, and Gamepad input handlers
        - Colored text rendering
        - FPS tracking
    `,
    
    // Classes
    classes: {
        gameObject: {
            description: "Base class for all game objects with position, velocity, and gravity properties",
            constructor: "new gameObject(x, y, width, height, ...scenes)",
            properties: {
                x: "X position of the object",
                y: "Y position of the object",
                width: "Width of the object",
                height: "Height of the object",
                rotation: "Rotation angle in degrees",
                velocity: "[speed, angle] for polar mode or [vx, vy] for cartesian",
                gravity: "Object containing gravity settings (enabled, velocity, grounded, etc.)",
                active: "Whether the object is active",
                visible: "Whether the object is visible",
                debug: "Toggle debug visualization"
            },
            methods: {
                enableGravity: "Enable gravity for this object",
                disableGravity: "Disable gravity for this object",
                setGravity: "Configure gravity settings: {enabled, mass, bounce, friction, groundTolerance}",
                setVelocity: "Set velocity towards a point: setVelocity(speed, x, y, error)",
                pointTo: "Rotate to face a target",
                distanceTo: "Get distance to another object",
                collidesWith: "Check collision with another object",
                addToScene: "Add object to a scene",
                removeFromScene: "Remove object from a scene",
                destroy: "Remove object from game",
                clone: "Create a copy of the object"
            },
            staticMethods: {
                setGlobalGravity: "Set global gravity strength",
                getGlobalGravity: "Get current gravity value",
                getActiveObjects: "Get all active objects",
                getObjectsInScene: "Get objects in a specific scene"
            }
        },
        
        Button: {
            description: "Interactive button class that extends gameObject",
            constructor: "new Button(x, y, width, height, displayText, ...scenes)",
            properties: {
                onClick: "Callback function when button is clicked",
                isHovered: "Whether mouse is over button",
                isPressed: "Whether button is being pressed",
                isDisabled: "Whether button is disabled"
            },
            methods: {
                setText: "Set button text",
                setColors: "Set button colors for different states",
                textStyle: "Set text color and size",
                Disable: "Enable/disable the button",
                click: "Simulate a button click"
            }
        },
        
        Scene: {
            description: "Scene management system for organizing game states",
            constructor: "new Scene(id, backgroundColor, ...scripts)",
            staticMethods: {
                switchToScene: "Switch to a different scene",
                getActiveScene: "Get the currently active scene",
                getSceneById: "Find a scene by ID",
                goBack: "Go back to previous scene"
            },
            methods: {
                addObject: "Add an object to the scene",
                addObjects: "Add multiple objects to the scene",
                removeObject: "Remove an object from the scene",
                clearObjects: "Remove all objects",
                pause: "Pause scene updates",
                resume: "Resume scene updates",
                setTransition: "Set scene transition effect"
            }
        },
        
        UIPlane: {
            description: "UI element for HUD and interface elements",
            constructor: "new UIPlane(executableFunction, formattingArray, ...scenes)",
            formatting: {
                txt: "Text styling: {title, heading, subtitle, base, color}",
                orientation: "Positioning: ['camera', offsetX, offsetY] or ['screen', x, y]",
                objectScale: "Scale factor for the UI plane"
            },
            methods: {
                drawText: "Draw formatted text on the UI plane",
                drawButton: "Draw a button on the UI plane",
                setOrientation: "Set position mode and offsets",
                setScale: "Set scale factor",
                addToScene: "Add UI plane to a scene"
            }
        },
        
        Camera: {
            description: "Camera system for following game objects",
            constructor: "new Camera(canvasWidth, canvasHeight)",
            methods: {
                link: "Make camera follow an object: link(object, offsetX, offsetY)",
                unlink: "Stop following",
                worldToScreen: "Convert world coordinates to screen coordinates",
                screenToWorld: "Convert screen coordinates to world coordinates",
                getOrientation: "Get camera position in world space"
            }
        }
    },
    
    // Input Handlers
    input: {
        mouse: {
            description: "Global mouse object for input detection",
            methods: {
                getMousePosition: "Get current mouse position {x, y}",
                isMousePressed: "Check if mouse button is pressed",
                wasMouseClicked: "Check if mouse was clicked this frame",
                isDragging: "Check if mouse is dragging",
                getDragDelta: "Get drag movement since drag started",
                getWheelDelta: "Get mouse wheel scroll amount"
            }
        },
        
        keyboard: {
            description: "Global keyboard object for input detection",
            methods: {
                keyPressed: "Check if specific keys are pressed",
                getKey: "Get key data object",
                held: "Get how long a key has been held (seconds)",
                typed: "Get typed characters with shift handling",
                getTypedBuffer: "Get current typed input without clearing"
            }
        },
        
        controller: {
            description: "Global game controller object",
            methods: {
                update: "Update controller state (call in draw)",
                getButton: "Check if a button is pressed by name",
                getAxis: "Get axis values (left/right stick)",
                isButtonPressed: "Check button by index",
                getButtonValue: "Get analog button value"
            },
            buttonNames: ["select", "back", "primary", "secondary", "leftbumber", "rightbumber", 
                         "lefttrigger", "righttrigger", "view", "menu", "leftstick", "rightstick",
                         "up", "down", "left", "right", "home"]
        }
    },
    
    // Utility Functions
    utilities: {
        coloredText: "Render text with color tags: coloredText('\\red|Hello| \\blue|World|', x, y)",
        getFPS: "Get current frames per second",
        generateId: "Generate unique ID with prefix",
        getTimestamp: "Get current timestamp in milliseconds"
    },
    
    // Getting Started
    quickStart: `
        // 1. Initialize the engine in setup()
        function setup() {
            MALC.init(800, 600); // Initialize with canvas size
        }
        
        // 2. Create a scene
        let gameScene = new MALC.Scene("game", 220);
        
        // 3. Create a game object with gravity
        let player = new MALC.gameObject(100, 100, 50, 50, "game")
            .enableGravity()
            .setGravity({ mass: 1, bounce: 0.3 });
        
        // 4. Add update logic in draw()
        function draw() {
            MALC.update(); // Updates all MALC systems
        }
    `
};

// ========== MALC MAIN OBJECT ==========
const MALC = {
    version: "1.0.1",
    
    // Core classes
    gameObject: gameObject,
    Button: Button,
    Scene: Scene,
    UIPlane: UIPlane,
    Camera: Camera,
    
    // Input handlers
    mouse: null,
    keyboard: keyboard,
    controller: controller,
    
    // FPS
    fps: fps,
    getFPS: getFPS,
    
    // Time tracking
    time: new Date(),
    startTime: new Date().getTime(),
    timer: 0,
    
    // Utility functions
    generateId: generateId,
    getTimestamp: getTimestamp,
    
    // Gravity constants
    GRAVITY: GRAVITY,
    TERMINAL_VELOCITY: TERMINAL_VELOCITY,
    
    // Help system
    help: function(topic = "overview") {
        if (topic === "overview") {
            console.log(helpDocs.overview);
            return helpDocs.overview;
        }
        
        // Check classes
        if (helpDocs.classes[topic]) {
            console.log(`=== ${topic.toUpperCase()} ===`);
            console.log(helpDocs.classes[topic].description);
            console.log("\nConstructor:", helpDocs.classes[topic].constructor);
            
            if (helpDocs.classes[topic].properties) {
                console.log("\nProperties:");
                Object.entries(helpDocs.classes[topic].properties).forEach(([prop, desc]) => {
                    console.log(`  ${prop}: ${desc}`);
                });
            }
            
            if (helpDocs.classes[topic].methods) {
                console.log("\nMethods:");
                Object.entries(helpDocs.classes[topic].methods).forEach(([method, desc]) => {
                    console.log(`  ${method}: ${desc}`);
                });
            }
            
            if (helpDocs.classes[topic].staticMethods) {
                console.log("\nStatic Methods:");
                Object.entries(helpDocs.classes[topic].staticMethods).forEach(([method, desc]) => {
                    console.log(`  static ${method}: ${desc}`);
                });
            }
            
            return helpDocs.classes[topic];
        }
        
        // Check input
        if (helpDocs.input[topic]) {
            console.log(`=== ${topic.toUpperCase()} ===`);
            console.log(helpDocs.input[topic].description);
            console.log("\nMethods:");
            Object.entries(helpDocs.input[topic].methods).forEach(([method, desc]) => {
                console.log(`  ${method}: ${desc}`);
            });
            
            if (topic === "controller" && helpDocs.input.controller.buttonNames) {
                console.log("\nButton Names:", helpDocs.input.controller.buttonNames.join(", "));
            }
            
            return helpDocs.input[topic];
        }
        
        // Check utilities
        if (helpDocs.utilities[topic]) {
            console.log(`=== ${topic.toUpperCase()} ===`);
            console.log(helpDocs.utilities[topic]);
            return helpDocs.utilities[topic];
        }
        
        // Quick start
        if (topic === "quickStart" || topic === "start") {
            console.log(helpDocs.quickStart);
            return helpDocs.quickStart;
        }
        
        // Not found
        console.log(`Help topic "${topic}" not found. Try: overview, classes (gameObject, Button, Scene, UIPlane, Camera), input (mouse, keyboard, controller), utilities (coloredText, getFPS), quickStart`);
        return null;
    },
    
    // List all available help topics
    helpTopics: function() {
        const topics = [
            "overview",
            "classes: " + Object.keys(helpDocs.classes).join(", "),
            "input: " + Object.keys(helpDocs.input).join(", "),
            "utilities: " + Object.keys(helpDocs.utilities).join(", "),
            "quickStart"
        ];
        console.log("Available help topics:\n" + topics.join("\n"));
        return topics;
    },
    
    // Initialize the engine
    init: function(canvasX, canvasY) {
        _p5.prototype.createCanvas(canvasX, canvasY);
        
        this.time = new Date();
        this.startTime = this.time.getTime();
        
        // Initialize camera
        window.camera = new Camera(canvasX, canvasY);
        
        // Initialize mouse handler
        this.mouse = new MouseHandler();
        window.mouse = this.mouse;
        
        // Start FPS tracking
        refreshLoop();
        
        // Create default scenes
        new Scene("blank", 70);
        new Scene("loading", 50, function(self) {
            _p5.prototype.textSize(24);
            let timed = (self.timeActive / 250 % 4);
            let dots = "";
            
            if (timed < 1) dots = ".";
            else if (timed < 2) dots = "..";
            else if (timed < 3) dots = "...";
            
            _p5.prototype.coloredText(`\\lime|Loading Game${dots}| `, 120, 200, _p5.prototype.LEFT, _p5.prototype.CENTER);
            _p5.prototype.textSize(16);
            
            let num = (Math.floor(self.timeActive / 100) / 10);
            _p5.prototype.coloredText(`\\red|${ Math.round((10 - num) * 10) / 10 + ((num + "").length < 2 ? ".0" : "")}|`, 200, 225, _p5.prototype.CENTER, _p5.prototype.CENTER);
        });
        
        Scene.activeScene = "loading";
        
        console.log("MALC Game Engine initialized v" + this.version);
        console.log("Type MALC.help() for documentation");
    },
    
    // Update all systems (call in draw)
    update: function() {
        this.time = new Date();
        this.timer = this.time - this.startTime;
        
        if (this.mouse) {
            this.mouse.rawX = _p5.prototype.mouseX;
            this.mouse.rawY = _p5.prototype.mouseY;
            this.mouse.x = this.mouse.rawX + window.camera.getOrientation()[0];
            this.mouse.y = this.mouse.rawY + window.camera.getOrientation()[1];
            this.mouse.down = _p5.prototype.mouseIsPressed;
        }
        
        controller.update();
        
        gameObject.update();
        Button.updateButton();
        
        this.fps = fps;
        
        if (typeof window.camera.render == "function") {
            window.camera.render();
        }
        Scene.update();
    }
};

// Initialize mouse and keyboard handlers
MALC.mouse = new MouseHandler();

return MALC;

}));
