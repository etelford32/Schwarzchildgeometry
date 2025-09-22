import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';

// Draggable Panel Component
const DraggablePanel = ({ title, children, initialPosition = { x: 20, y: 20 }, initialSize = { width: 300, height: 400 }, collapsible = true, className = "" }) => {
  const [position, setPosition] = useState(initialPosition);
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);
  
  const handleMouseDown = useCallback((e) => {
    if (e.target.classList.contains('resize-handle')) return;
    const rect = panelRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  }, [isDragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsResizing(false);
  }, []);

  const handleResize = useCallback((e) => {
    if (!isResizing) return;
    const rect = panelRef.current.getBoundingClientRect();
    const newWidth = Math.max(250, e.clientX - rect.left);
    const newHeight = Math.max(200, e.clientY - rect.top);
    setSize({ width: newWidth, height: newHeight });
  }, [isResizing]);

  const handleResizeStart = useCallback((e) => {
    setIsResizing(true);
    e.stopPropagation();
  }, []);

  useEffect(() => {
    if (isDragging || isResizing) {
      document.addEventListener('mousemove', isDragging ? handleMouseMove : handleResize);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', isDragging ? handleMouseMove : handleResize);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, isResizing, handleMouseMove, handleMouseUp, handleResize]);

  return (
    <div
      ref={panelRef}
      className={`fixed bg-gray-900 bg-opacity-95 backdrop-blur-sm border border-gray-600 rounded-lg shadow-2xl z-50 ${className}`}
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: isCollapsed ? 'auto' : size.height,
        minWidth: '250px'
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 bg-gray-800 rounded-t-lg cursor-move border-b border-gray-600"
        onMouseDown={handleMouseDown}
      >
        <h3 className="text-white font-semibold text-sm">{title}</h3>
        <div className="flex gap-1">
          {collapsible && (
            <button
              className="w-5 h-5 rounded bg-yellow-500 hover:bg-yellow-600 flex items-center justify-center text-xs"
              onClick={() => setIsCollapsed(!isCollapsed)}
            >
              {isCollapsed ? '▲' : '▼'}
            </button>
          )}
        </div>
      </div>
      
      {/* Content */}
      {!isCollapsed && (
        <div className="p-4 text-white overflow-auto" style={{ height: size.height - 60 }}>
          {children}
        </div>
      )}
      
      {/* Resize handle */}
      {!isCollapsed && (
        <div
          className="absolute bottom-0 right-0 w-4 h-4 bg-gray-600 cursor-nw-resize resize-handle"
          onMouseDown={handleResizeStart}
          style={{ clipPath: 'polygon(100% 0, 100% 100%, 0 100%)' }}
        />
      )}
    </div>
  );
};

const GravitationalSink = () => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const animationIdRef = useRef(null);
  
  // Core physics parameters
  const [mass, setMass] = useState(2.0);
  const [gravityStrength, setGravityStrength] = useState(1.2);
  const [particleCount, setParticleCount] = useState(12);
  
  // Display options
  const [showGrid, setShowGrid] = useState(true);
  const [showHorizon, setShowHorizon] = useState(true);
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showParticles, setShowParticles] = useState(true);
  const [showVelocityTrails, setShowVelocityTrails] = useState(true);
  
  // Animation controls
  const [animationSpeed, setAnimationSpeed] = useState(1.0);
  const [rotationSpeed, setRotationSpeed] = useState(0.15);
  const [isPlaying, setIsPlaying] = useState(true);
  const [cameraDistance, setCameraDistance] = useState(25);
  
  // Interaction
  const [selectedParticle, setSelectedParticle] = useState(null);
  const [hoveredParticle, setHoveredParticle] = useState(null);
  const [physicsUpdate, setPhysicsUpdate] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);
  
  const particlesRef = useRef([]);
  const trajectoryDataRef = useRef([]);
  const physicsDataRef = useRef([]);
  const velocityTrailsRef = useRef([]);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const mouseDownRef = useRef(false);
  const animationTimeRef = useRef(0);
  
  // Computed values
  const schwarzschildRadius = 2 * mass * gravityStrength;
  const maxCurvatureDepth = schwarzschildRadius * gravityStrength * 4;
  const escapeVelocityAtDistance = useCallback((r) => 
    Math.sqrt(2 * mass * gravityStrength / Math.max(r, schwarzschildRadius * 1.1)), 
    [mass, gravityStrength, schwarzschildRadius]
  );

  // Reset function
  const resetSimulation = useCallback(() => {
    setSelectedParticle(null);
    setHoveredParticle(null);
    setPhysicsUpdate(0);
    animationTimeRef.current = 0;
    particlesRef.current = [];
    trajectoryDataRef.current = [];
    physicsDataRef.current = [];
    velocityTrailsRef.current = [];
    setResetTrigger(prev => prev + 1);
  }, []);

  // Main scene setup
  useEffect(() => {
    if (!mountRef.current) return;

    // Cleanup previous scene
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }
    
    if (mountRef.current.firstChild) {
      mountRef.current.removeChild(mountRef.current.firstChild);
    }

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.Fog(0x050510, 50, 100);
    
    const camera = new THREE.PerspectiveCamera(
      60,
      mountRef.current.clientWidth / mountRef.current.clientHeight, 
      0.1, 
      1000
    );
    camera.position.set(cameraDistance, cameraDistance * 0.8, cameraDistance * 0.6);
    camera.lookAt(0, 0, 0);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x050510, 1);
    
    mountRef.current.appendChild(renderer.domElement);
    
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x202040, 0.3);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0x6080ff, 0.7);
    directionalLight.position.set(30, 40, 30);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    const wellLight = new THREE.PointLight(0xff4444, 0.8, 50);
    wellLight.position.set(0, -5, 0);
    scene.add(wellLight);

    // Central mass
    const centralMassGeometry = new THREE.SphereGeometry(0.8, 32, 32);
    const centralMassMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x000000,
      emissive: 0x330011,
      emissiveIntensity: 0.3
    });
    const centralMass = new THREE.Mesh(centralMassGeometry, centralMassMaterial);
    centralMass.castShadow = true;
    scene.add(centralMass);

    // Mouse interaction handlers
    const handleMouseDown = (event) => {
      mouseDownRef.current = true;
    };
    
    const handleMouseMove = (event) => {
      if (!mouseDownRef.current) return;
      
      const deltaX = event.movementX || 0;
      const deltaY = event.movementY || 0;
      
      const spherical = new THREE.Spherical();
      spherical.setFromVector3(camera.position);
      spherical.theta -= deltaX * 0.005;
      spherical.phi += deltaY * 0.005;
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
      
      camera.position.setFromSpherical(spherical);
      camera.lookAt(0, 0, 0);
    };
    
    const handleMouseUp = () => {
      mouseDownRef.current = false;
    };

    // Particle interaction - safer implementation
    const handleParticleHover = (event) => {
      if (mouseDownRef.current || !particlesRef.current || particlesRef.current.length === 0) return;
      
      try {
        const rect = renderer.domElement.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const intersects = raycasterRef.current.intersectObjects(particlesRef.current.filter(p => p && p.visible));
        
        if (intersects.length > 0) {
          const particleIndex = particlesRef.current.findIndex(p => p === intersects[0].object);
          if (particleIndex !== -1 && particleIndex !== hoveredParticle) {
            setHoveredParticle(particleIndex);
            renderer.domElement.style.cursor = 'pointer';
          }
        } else if (hoveredParticle !== null) {
          setHoveredParticle(null);
          renderer.domElement.style.cursor = 'default';
        }
      } catch (error) {
        console.warn('Hover interaction error:', error);
        setHoveredParticle(null);
      }
    };
    
    const handleParticleClick = (event) => {
      if (mouseDownRef.current || !particlesRef.current || particlesRef.current.length === 0) return;
      
      try {
        const rect = renderer.domElement.getBoundingClientRect();
        mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        const intersects = raycasterRef.current.intersectObjects(particlesRef.current.filter(p => p && p.visible));
        
        if (intersects.length > 0) {
          const particleIndex = particlesRef.current.findIndex(p => p === intersects[0].object);
          if (particleIndex !== -1) {
            setSelectedParticle(particleIndex === selectedParticle ? null : particleIndex);
          }
        } else {
          setSelectedParticle(null);
        }
      } catch (error) {
        console.warn('Click interaction error:', error);
        setSelectedParticle(null);
      }
    };
    
    renderer.domElement.addEventListener('mousedown', handleMouseDown);
    renderer.domElement.addEventListener('mousemove', handleParticleHover);
    renderer.domElement.addEventListener('click', handleParticleClick);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Enhanced particle physics
    const updateParticles = (time) => {
      if (!particlesRef.current || particlesRef.current.length === 0) return;
      
      particlesRef.current.forEach((particle, index) => {
        if (!particle || !trajectoryDataRef.current[index] || !particle.visible) return;
        
        try {
          const trajectory = trajectoryDataRef.current[index];
          const baseSpeed = 0.2;
          
          const progress = ((time * baseSpeed * (0.8 + index * 0.1)) % (trajectory.length * 0.2)) / (trajectory.length * 0.2);
          const pointIndex = Math.floor(progress * (trajectory.length - 1));
          const nextPointIndex = Math.min(pointIndex + 1, trajectory.length - 1);
          
          if (trajectory[pointIndex] && trajectory[nextPointIndex]) {
            const currentPos = trajectory[pointIndex];
            const nextPos = trajectory[nextPointIndex];
            particle.position.copy(currentPos);
            
            const r = Math.max(currentPos.length(), schwarzschildRadius * 1.01);
            const rs = schwarzschildRadius;
            
            const gravitationalAcceleration = (mass * gravityStrength) / (r * r);
            const localVelocity = Math.sqrt(gravitationalAcceleration * r) * (rs / r);
            
            const velocity = nextPos.clone().sub(currentPos).normalize().multiplyScalar(localVelocity);
            const radialVelocity = currentPos.clone().normalize().dot(velocity);
            const tangentialVelocity = velocity.clone().sub(currentPos.clone().normalize().multiplyScalar(radialVelocity));
            const angularVelocity = tangentialVelocity.length() / r;
            
            const timeDilation = Math.sqrt(Math.max(0.001, 1 - rs/r));
            const coordinateVelocity = localVelocity * (1 - rs/r);
            const properVelocity = coordinateVelocity / timeDilation;
            const redshift = (1/timeDilation) - 1;
            
            const orbitalPeriod = r > rs * 1.5 ? 2 * Math.PI / Math.max(angularVelocity, 0.001) : 0;
            const escapeVel = escapeVelocityAtDistance(r);
            
            // Store physics data safely
            if (!physicsDataRef.current[index]) {
              physicsDataRef.current[index] = {};
            }
            
            Object.assign(physicsDataRef.current[index], {
              radius: r,
              timeDilation: timeDilation,
              coordinateVelocity: coordinateVelocity,
              properVelocity: properVelocity,
              localVelocity: localVelocity,
              radialVelocity: Math.abs(radialVelocity),
              tangentialVelocity: tangentialVelocity.length(),
              angularVelocity: angularVelocity,
              orbitalPeriod: orbitalPeriod,
              redshift: redshift,
              escapeVelocity: escapeVel,
              gravAcceleration: gravitationalAcceleration,
              kineticEnergy: 0.5 * localVelocity * localVelocity,
              potentialEnergy: -mass * gravityStrength / r,
              particleIndex: index
            });
            
            // Visual effects
            const velocityRatio = localVelocity / escapeVel;
            const fadeDistance = schwarzschildRadius * 2.5;
            let opacity = 0.95;
            
            if (r < fadeDistance) {
              opacity = Math.max(0.05, (r - schwarzschildRadius) / (fadeDistance - schwarzschildRadius));
            }
            
            // Particle scaling and highlighting
            if (index === selectedParticle) {
              particle.scale.set(3, 3, 3);
              opacity = 1.0;
            } else if (index === hoveredParticle) {
              particle.scale.set(2, 2, 2);
              opacity = 1.0;
            } else {
              const baseScale = 0.8 + (velocityRatio * 1.2);
              particle.scale.set(baseScale, baseScale, baseScale);
            }
            
            particle.material.opacity = opacity;
            
            // Color coding by velocity
            const speedHue = Math.max(0, 0.6 - velocityRatio * 0.5);
            const speedSaturation = Math.min(1, velocityRatio * 2);
            const speedLightness = 0.4 + velocityRatio * 0.5;
            
            if (r < rs * 1.3) {
              particle.material.color.setHSL(0, 1, Math.max(0.2, speedLightness));
            } else {
              particle.material.color.setHSL(speedHue, speedSaturation, speedLightness);
            }
          }
        } catch (error) {
          console.warn('Particle update error:', error);
        }
      });
    };

    // Animation loop
    const animate = () => {
      try {
        if (isPlaying) {
          animationTimeRef.current += 0.016 * animationSpeed;
          
          if (sceneRef.current && rotationSpeed > 0) {
            sceneRef.current.rotation.y = animationTimeRef.current * rotationSpeed;
          }
          
          updateParticles(animationTimeRef.current);
          
          if (animationTimeRef.current % 6 < 0.1) { // Update every ~6 frames
            setPhysicsUpdate(prev => prev + 1);
          }
        }
        
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
        animationIdRef.current = requestAnimationFrame(animate);
      } catch (error) {
        console.error('Animation error:', error);
      }
    };
    animate();

    const handleResize = () => {
      if (!mountRef.current || !camera || !renderer) return;
      camera.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      
      if (renderer && renderer.domElement) {
        renderer.domElement.removeEventListener('mousedown', handleMouseDown);
        renderer.domElement.removeEventListener('mousemove', handleParticleHover);
        renderer.domElement.removeEventListener('click', handleParticleClick);
      }
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      if (mountRef.current && mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
      }
      if (renderer) {
        renderer.dispose();
      }
    };
  }, [mass, gravityStrength, particleCount, cameraDistance, animationSpeed, rotationSpeed, isPlaying, resetTrigger, escapeVelocityAtDistance]);

  // Spacetime grid
  useEffect(() => {
    if (!sceneRef.current) return;

    const existingGrid = sceneRef.current.getObjectByName('spacetimeGrid');
    if (existingGrid) {
      sceneRef.current.remove(existingGrid);
    }

    if (!showGrid) return;

    const gridGroup = new THREE.Group();
    gridGroup.name = 'spacetimeGrid';

    const gridSize = 40;
    const gridResolution = 60;
    const maxDepth = maxCurvatureDepth;
    
    for (let i = 0; i <= gridResolution; i++) {
      const points = [];
      for (let j = 0; j <= gridResolution; j++) {
        const x = (i - gridResolution/2) * gridSize / gridResolution;
        const z = (j - gridResolution/2) * gridSize / gridResolution;
        const r = Math.sqrt(x*x + z*z);
        
        let y = 0;
        if (r > schwarzschildRadius * 0.5) {
          const curvatureFactor = Math.pow(schwarzschildRadius * gravityStrength / Math.max(r, schwarzschildRadius * 0.5), 1.5);
          y = -curvatureFactor * maxDepth * 0.3;
          y += Math.sin(r * 0.5) * curvatureFactor * 0.5;
        } else {
          y = -maxDepth;
        }
        
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const colors = [];
      points.forEach(point => {
        const intensity = Math.max(0, -point.y / maxDepth);
        colors.push(0.2 + intensity * 0.6, 0.4 + intensity * 0.4, 1.0);
      });
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const material = new THREE.LineBasicMaterial({ 
        vertexColors: true,
        opacity: 0.7, 
        transparent: true
      });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);
    }
    
    // Perpendicular lines
    for (let i = 0; i <= gridResolution; i++) {
      const points = [];
      for (let j = 0; j <= gridResolution; j++) {
        const x = (j - gridResolution/2) * gridSize / gridResolution;
        const z = (i - gridResolution/2) * gridSize / gridResolution;
        const r = Math.sqrt(x*x + z*z);
        
        let y = 0;
        if (r > schwarzschildRadius * 0.5) {
          const curvatureFactor = Math.pow(schwarzschildRadius * gravityStrength / Math.max(r, schwarzschildRadius * 0.5), 1.5);
          y = -curvatureFactor * maxDepth * 0.3;
          y += Math.sin(r * 0.5) * curvatureFactor * 0.5;
        } else {
          y = -maxDepth;
        }
        
        points.push(new THREE.Vector3(x, y, z));
      }
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const colors = [];
      points.forEach(point => {
        const intensity = Math.max(0, -point.y / maxDepth);
        colors.push(0.2 + intensity * 0.6, 0.4 + intensity * 0.4, 1.0);
      });
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      
      const material = new THREE.LineBasicMaterial({ 
        vertexColors: true,
        opacity: 0.7, 
        transparent: true
      });
      const line = new THREE.Line(geometry, material);
      gridGroup.add(line);
    }

    sceneRef.current.add(gridGroup);
  }, [showGrid, mass, gravityStrength, schwarzschildRadius, maxCurvatureDepth]);

  // Event horizon
  useEffect(() => {
    if (!sceneRef.current) return;

    const existingHorizon = sceneRef.current.getObjectByName('eventHorizon');
    if (existingHorizon) {
      sceneRef.current.remove(existingHorizon);
    }

    if (!showHorizon) return;

    const horizonGeometry = new THREE.SphereGeometry(schwarzschildRadius, 64, 64);
    const horizonMaterial = new THREE.MeshBasicMaterial({ 
      color: 0xff2244, 
      opacity: 0.25 + (gravityStrength - 1) * 0.1,
      transparent: true,
      side: THREE.DoubleSide
    });
    const eventHorizon = new THREE.Mesh(horizonGeometry, horizonMaterial);
    eventHorizon.name = 'eventHorizon';
    
    const glowGeometry = new THREE.SphereGeometry(schwarzschildRadius * 1.1, 32, 32);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4466,
      opacity: 0.1,
      transparent: true,
      side: THREE.BackSide
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    eventHorizon.add(glow);
    
    sceneRef.current.add(eventHorizon);
  }, [showHorizon, schwarzschildRadius, gravityStrength]);

  // Particles and trajectories
  useEffect(() => {
    if (!sceneRef.current) return;

    const existingTrajectories = sceneRef.current.getObjectByName('trajectories');
    const existingParticles = sceneRef.current.getObjectByName('particles');
    
    [existingTrajectories, existingParticles].forEach(obj => {
      if (obj) sceneRef.current.remove(obj);
    });

    if (!showTrajectories && !showParticles) return;

    const trajectoryGroup = new THREE.Group();
    trajectoryGroup.name = 'trajectories';
    
    const particleGroup = new THREE.Group();
    particleGroup.name = 'particles';
    
    // Reset arrays
    particlesRef.current = [];
    trajectoryDataRef.current = [];
    physicsDataRef.current = [];

    for (let t = 0; t < particleCount; t++) {
      const angle = (t / particleCount) * Math.PI * 2;
      const startRadius = 20 + t * 2;
      
      const points = [];
      const numPoints = 500;
      
      for (let i = 0; i < numPoints; i++) {
        const progress = i / numPoints;
        const phi = progress * Math.PI * 5 + angle;
        
        let r = startRadius * (1 - progress * 0.9);
        r = Math.max(r, schwarzschildRadius * 1.02);
        r = r * (1 + 0.1 * Math.sin(phi * 3));
        
        const x = r * Math.cos(phi);
        const z = r * Math.sin(phi);
        
        let y = 0;
        if (r > schwarzschildRadius * 0.5) {
          const curvatureFactor = Math.pow(schwarzschildRadius * gravityStrength / Math.max(r, schwarzschildRadius * 0.5), 1.5);
          y = -curvatureFactor * maxCurvatureDepth * 0.3;
          y += Math.sin(r * 0.5) * curvatureFactor * 0.5;
        } else {
          y = -maxCurvatureDepth;
        }
        
        points.push(new THREE.Vector3(x, y, z));
      }
      
      trajectoryDataRef.current[t] = points;
      
      if (showTrajectories) {
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ 
          color: new THREE.Color().setHSL(t / particleCount, 0.8, 0.6),
          opacity: 0.5,
          transparent: true
        });
        const trajectory = new THREE.Line(geometry, material);
        trajectoryGroup.add(trajectory);
      }
      
      if (showParticles) {
        const particleGeometry = new THREE.SphereGeometry(0.08, 12, 12);
        const particleMaterial = new THREE.MeshBasicMaterial({ 
          color: 0xffff00,
          opacity: 0.95,
          transparent: true
        });
        const particle = new THREE.Mesh(particleGeometry, particleMaterial);
        particle.castShadow = true;
        particle.visible = true;
        
        particlesRef.current[t] = particle;
        particleGroup.add(particle);
        
        // Initialize physics data
        physicsDataRef.current[t] = {
          radius: 0, timeDilation: 1, coordinateVelocity: 0,
          properVelocity: 0, localVelocity: 0, radialVelocity: 0,
          tangentialVelocity: 0, angularVelocity: 0, orbitalPeriod: 0,
          redshift: 0, escapeVelocity: 0, gravAcceleration: 0,
          kineticEnergy: 0, potentialEnergy: 0, particleIndex: t
        };
      }
    }

    if (showTrajectories) sceneRef.current.add(trajectoryGroup);
    if (showParticles) sceneRef.current.add(particleGroup);
  }, [showTrajectories, showParticles, schwarzschildRadius, particleCount, gravityStrength, maxCurvatureDepth]);

  // Camera distance update
  useEffect(() => {
    if (!cameraRef.current) return;
    
    const currentPosition = cameraRef.current.position.clone();
    const spherical = new THREE.Spherical();
    spherical.setFromVector3(currentPosition);
    spherical.radius = cameraDistance;
    
    cameraRef.current.position.setFromSpherical(spherical);
    cameraRef.current.lookAt(0, 0, 0);
  }, [cameraDistance]);

  return (
    <div className="w-full h-screen bg-gray-900 relative overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      
      {/* Enhanced Gravitational Sink Controls */}
      <DraggablePanel 
        title="🌌 Gravitational Sink Controls"
        initialPosition={{ x: 20, y: 20 }}
        initialSize={{ width: 320, height: 650 }}
      >
        <div className="space-y-4">
          {/* Reset Button */}
          <div className="bg-red-900 bg-opacity-30 p-3 rounded-lg border border-red-500">
            <button
              onClick={resetSimulation}
              className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all transform hover:scale-105"
            >
              🔄 RESET SIMULATION
            </button>
            <div className="text-xs text-gray-400 mt-2 text-center">
              Fix any issues or start fresh
            </div>
          </div>

          <div className="bg-gray-800 p-3 rounded-lg border border-blue-500">
            <h4 className="text-blue-300 font-bold mb-2">🔥 Core Parameters</h4>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Central Mass: {mass.toFixed(1)} M☉
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="4.0"
                  step="0.1"
                  value={mass}
                  onChange={(e) => setMass(parseFloat(e.target.value))}
                  className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-xs text-gray-400 mt-1">
                  Mass determines the depth of the spacetime sink
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Gravity Strength: {gravityStrength.toFixed(1)}×
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="2.5"
                  step="0.1"
                  value={gravityStrength}
                  onChange={(e) => setGravityStrength(parseFloat(e.target.value))}
                  className="w-full h-3 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
                <div className="text-xs text-gray-400 mt-1">
                  Amplifies curvature and particle acceleration
                </div>
              </div>
              
              <div className="bg-gray-700 p-2 rounded text-xs">
                <div><strong className="text-red-300">Schwarzschild Radius:</strong> {schwarzschildRadius.toFixed(2)} M</div>
                <div><strong className="text-blue-300">Max Sink Depth:</strong> {maxCurvatureDepth.toFixed(1)} M</div>
              </div>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-2">Test Particles: {particleCount}</label>
            <input
              type="range"
              min="4"
              max="20"
              step="1"
              value={particleCount}
              onChange={(e) => setParticleCount(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <div className="border-t border-gray-600 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105 ${
                  isPlaying 
                    ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg' 
                    : 'bg-green-600 hover:bg-green-700 text-white shadow-lg'
                }`}
              >
                {isPlaying ? '⏸️ PAUSE' : '▶️ EVOLVE'}
              </button>
              <div className="text-xs">
                <div className={isPlaying ? 'text-green-400' : 'text-red-400'}>
                  {isPlaying ? '● ACTIVE' : '● FROZEN'}
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Evolution Speed: {animationSpeed.toFixed(1)}×
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="3.0"
                  step="0.1"
                  value={animationSpeed}
                  onChange={(e) => setAnimationSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Rotation: {rotationSpeed.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="0.5"
                  step="0.01"
                  value={rotationSpeed}
                  onChange={(e) => setRotationSpeed(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">View Distance: {cameraDistance}</label>
                <input
                  type="range"
                  min="15"
                  max="50"
                  step="1"
                  value={cameraDistance}
                  onChange={(e) => setCameraDistance(parseInt(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>
          </div>
          
          <div className="space-y-2 border-t border-gray-600 pt-4">
            <h4 className="text-sm font-semibold text-purple-300">🎭 Visualization</h4>
            {[
              { key: 'showGrid', state: showGrid, setter: setShowGrid, label: '🌐 Spacetime Sink', desc: 'The gravitational well' },
              { key: 'showHorizon', state: showHorizon, setter: setShowHorizon, label: '🔴 Event Horizon', desc: 'Point of no return' },
              { key: 'showTrajectories', state: showTrajectories, setter: setShowTrajectories, label: '🛤️ Geodesic Paths', desc: 'Particle trajectories' },
              { key: 'showParticles', state: showParticles, setter: setShowParticles, label: '⚡ Test Masses', desc: 'Accelerating particles' },
              { key: 'showVelocityTrails', state: showVelocityTrails, setter: setShowVelocityTrails, label: '🌟 Velocity Trails', desc: 'Speed visualization' }
            ].map(({ key, state, setter, label, desc }) => (
              <label key={key} className="flex items-center cursor-pointer hover:bg-gray-800 p-2 rounded">
                <input
                  type="checkbox"
                  checked={state}
                  onChange={(e) => setter(e.target.checked)}
                  className="mr-3 w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                />
                <div>
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </DraggablePanel>

      {/* Enhanced Physics Analysis */}
      <DraggablePanel 
        title="📈 Gravitational Physics Analysis"
        initialPosition={{ x: typeof window !== 'undefined' ? window.innerWidth - 350 : 350, y: 20 }}
        initialSize={{ width: 330, height: 550 }}
      >
        <div key={physicsUpdate} className="font-mono text-sm">
          {selectedParticle !== null && physicsDataRef.current[selectedParticle] ? (
            <div className="space-y-3">
              <div className="bg-yellow-900 bg-opacity-30 p-3 rounded-lg border border-yellow-500">
                <div className="text-yellow-300 font-bold font-sans mb-2">
                  🎯 Particle #{selectedParticle + 1} Analysis
                </div>
                
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <div className="text-gray-300">Distance:</div>
                  <div className="text-cyan-300">{physicsDataRef.current[selectedParticle]?.radius?.toFixed(2) || 'N/A'} M</div>
                  
                  <div className="text-gray-300">r/rs ratio:</div>
                  <div className={(physicsDataRef.current[selectedParticle]?.radius || 0) / schwarzschildRadius < 2 ? 'text-red-300' : 'text-green-300'}>
                    {((physicsDataRef.current[selectedParticle]?.radius || 0) / schwarzschildRadius).toFixed(3)}
                  </div>
                </div>
                
                <div className="mt-3 space-y-1">
                  <div className="text-white font-semibold">🚀 Velocity Analysis:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div>Local Speed:</div>
                    <div className="text-orange-300 font-bold">{physicsDataRef.current[selectedParticle]?.localVelocity?.toFixed(3) || 'N/A'}c</div>
                    
                    <div>Escape Velocity:</div>
                    <div className="text-red-300">{physicsDataRef.current[selectedParticle]?.escapeVelocity?.toFixed(3) || 'N/A'}c</div>
                    
                    <div>Angular ω:</div>
                    <div className="text-purple-300">{physicsDataRef.current[selectedParticle]?.angularVelocity?.toFixed(4) || 'N/A'} rad/s</div>
                  </div>
                </div>
                
                <div className="mt-3 space-y-1">
                  <div className="text-white font-semibold">⏰ Relativistic Effects:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div>Time Dilation γ:</div>
                    <div className="text-cyan-300">{physicsDataRef.current[selectedParticle]?.timeDilation?.toFixed(4) || 'N/A'}</div>
                    
                    <div>Redshift z:</div>
                    <div className="text-red-300">{physicsDataRef.current[selectedParticle]?.redshift?.toFixed(3) || 'N/A'}</div>
                    
                    <div>Proper Velocity:</div>
                    <div className="text-green-300">{physicsDataRef.current[selectedParticle]?.properVelocity?.toFixed(3) || 'N/A'}c</div>
                  </div>
                </div>
                
                <div className="mt-3 space-y-1">
                  <div className="text-white font-semibold">⚡ Energy Analysis:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div>Kinetic Energy:</div>
                    <div className="text-yellow-300">{physicsDataRef.current[selectedParticle]?.kineticEnergy?.toFixed(3) || 'N/A'}</div>
                    
                    <div>Potential Energy:</div>
                    <div className="text-blue-300">{physicsDataRef.current[selectedParticle]?.potentialEnergy?.toFixed(3) || 'N/A'}</div>
                    
                    <div>Grav. Acceleration:</div>
                    <div className="text-orange-300">{physicsDataRef.current[selectedParticle]?.gravAcceleration?.toFixed(2) || 'N/A'} m/s²</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-green-300 font-bold font-sans mb-3">
                🌌 Gravitational Sink System
              </div>
              
              <div className="bg-gray-800 p-3 rounded-lg">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>Central Mass:</div><div className="text-yellow-300">{mass.toFixed(1)} M☉</div>
                  <div>Gravity Strength:</div><div className="text-orange-300">{gravityStrength.toFixed(1)}×</div>
                  <div>Event Horizon:</div><div className="text-red-300">{schwarzschildRadius.toFixed(2)} M</div>
                  <div>Sink Depth:</div><div className="text-blue-300">{maxCurvatureDepth.toFixed(1)} M</div>
                  <div>Test Particles:</div><div className="text-purple-300">{particlesRef.current.length}</div>
                  <div>System Status:</div><div className={isPlaying ? 'text-green-400' : 'text-red-400'}>{isPlaying ? '🟢 EVOLVING' : '🔴 FROZEN'}</div>
                </div>
              </div>
              
              <div className="bg-blue-900 bg-opacity-30 p-3 rounded-lg border border-blue-500">
                <div className="text-blue-300 font-semibold mb-2">🎯 How to Explore:</div>
                <div className="text-xs space-y-1 text-gray-300">
                  <div>• <strong>Hover particles</strong> → Quick velocity data</div>
                  <div>• <strong>Click particles</strong> → Full physics analysis</div>
                  <div>• <strong>Increase mass</strong> → Deeper gravitational sink</div>
                  <div>• <strong>Boost gravity</strong> → More extreme curvature</div>
                  <div>• <strong>Watch colors</strong> → Blue=slow, Red=near horizon</div>
                  <div>• <strong>Use RESET</strong> → Fix any issues</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-4 text-xs text-gray-400 font-sans space-y-1">
            <div><span className="text-cyan-300">γ:</span> Time slows down near mass</div>
            <div><span className="text-red-300">z:</span> Light shifts to red frequencies</div>
            <div><span className="text-orange-300">Local Speed:</span> How fast particle moves</div>
            <div><span className="text-purple-300">ω:</span> Angular rotation rate</div>
            <div className="text-green-300 mt-2">💡 This is how galaxies and solar systems form!</div>
          </div>
        </div>
      </DraggablePanel>
    </div>
  );
};

export default GravitationalSink;
