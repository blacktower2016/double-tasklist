

class Task {

    /*
        Create task.
     */

    constructor(obj) {
        this.description = obj.description;
        this.isCompleted = obj.isCompleted;
        this.lastChanged = obj.lastChanged;

    }

    getLi(){
        /*
            returns <li> html code for task.
        */
        let task_li = $('<li>').addClass("task-li");
        if (this.isCompleted) {
            task_li.addClass("done");
        }
        return $(task_li).html(`<i class="fa fa-check"></i><i class="fa fa-times"></i><i class="fa fa-arrow-up"></i>${this.description}`);
    };
};



class TaskList{
    /**
     *   Create TaskList
     *    id - id of html div element that will contain the tasklist
     *    title  - name of the tasklist. 
     */

    constructor(id, title){ 

        this.id=id;
        this.title = title;
        
        this.list = $(`#${this.id}`);
        
        this.ul = null; // available after TaskList.render()
        

        let bindedRenderTask = this.renderTask.bind(this);
        let bindedCompleteTask = this.completeTask.bind(this);
        let bindedDeleteTask = this.deleteTask.bind(this);
        let bindedLiftUpTask = this.liftUpTask.bind(this);
        let bindedAddTask = this.addTask.bind(this);

        // firebase events

        let currentUid = firebase.auth().currentUser.uid;
        this.ref = firebase.database().ref('users/'+currentUid+'/'+this.id);

        this.ref.on('child_added',function(data) {
            bindedRenderTask(data.key, data.val());
        });

        this.ref.on('child_removed', function(data){
            $(`#${data.key}`).remove();
        });

        // list and form events

        this.list.on('click', '.fa.fa-check', function(event){
            let selectedTask = $(this).closest('li');
            bindedCompleteTask(selectedTask);
        });

        this.list.on('click', '.fa.fa-times', function(event){
            let selectedTask = $(this).closest('li');
            bindedDeleteTask(selectedTask);
        });

        this.list.on('click', '.fa.fa-arrow-up', function(event) {
            let selectedTask = $(this).closest('li');
            bindedLiftUpTask(selectedTask);
        });

        this.form = this.list.find("form");
        this.form.on('keypress', function(event){
            if (event.which == 13){
                event.preventDefault();
                $(this).find("button").click();
            }
        });    
        this.form.on('click',"button",bindedAddTask);
        
        $(`#${this.id} .tasklist-form`).after(`<div class="col-xs-12 col-md-12"><ul class="tasks"></ul></div>`);
        this.load();    // load list of tasks from Firebase
    };

    addTitleHref(href){
        //add html link to the title string.
        this.title =  `<a href="${href}">${this.title}<a>`;
    }

    onSortableStop(taskId, previousTaskId, nextTaskId){
        // save tasks position after drag-n-drop
        // lastChanged field is used for positioning.
        console.log("++++ onSortableStop ++++++");
        let prevTaskLC = null;
        let nextTaskLC = null;
        if (previousTaskId){
            prevTaskLC = getTaskFromFirebase(this, previousTaskId).lastChanged;
            if ( nextTaskId ) {
            nextTaskLC = getTaskFromFirebase(this, nextTaskId).lastChanged;
            }
        
            let lc = Math.floor((prevTaskLC+nextTaskLC)/2);
            this.ref.child(taskId).update({
                'lastChanged':lc-5,
                '-lastChanged': -(lc-5)
            });
        }else{
            updateLastChanged(this, taskId);
        }
        console.log("++++ END onSortableStop ++++++");
        
    };
    renderTask(taskId, obj){
        /**
         * Return task html code.
         * Add listener for "task completed" event from firebase
         */
        let task = new Task(obj);
        var html = task.getLi().attr("id", taskId);
        html.prependTo(`#${this.id} .tasks`);
        if (!task.isCompleted){
            html.find(".fa.fa-times").hide();
        };
        //console.log(""+html);
        addTaskCompletedListener(this, taskId, html);
        return html;
    };



    render(){

        /**
         * Render tasklist and all its tasks 
         */  

        console.log($(`#${this.id} h1`).html());

        $(`#${this.id} h1`).html(`<i class="fa fa-calendar"></i>Tasks: <span class="tl_title">${this.title}</span>`);        
        

        this.ul = $(`#${this.id} ul`);
        this.ul.addClass(".connected-tasklist");
        this.ul.empty();

        // wrapping functions for Sortable jquery-ui element
        function wrapSortStop(taskId,prevTaskId,nextTaskId){
            //console.log(this);
            this.onSortableStop(taskId,prevTaskId, nextTaskId);
        };
        wrapSortStop = wrapSortStop.bind(this);

        function getThis(){
            return this;
        };
        getThis = getThis.bind(this);


        // Sortable events
        let prev=null;          //previous li element id after dropping
        let next=null;          //next li element id after dropping
        let senderListId = null;    // sender tasklist.id
        let receiverListId = null;  // receiver tasklist.id

        this.ul.sortable({

            start: function(event, ui){
                //console.log("======start======="+getThis().id);
                prev = $(ui.item).prev().attr('id');
                next = $(ui.item).next().attr('id');
                senderListId = $(this).parents(".tasklist").attr("id");
                //console.log("senderListId: ", senderListId);
            },
            
            stop: function(event, ui){ 

                // only if sorting within single tasklist
                if (receiverListId==null) {                            
                    if (prev !== $(ui.item).prev().attr('id')) { // if li changes position
                        prev = $(ui.item).prev().attr('id');
                        next = $(ui.item).next().attr('id');
                        wrapSortStop($(ui.item).attr("id"), prev, next);
                }

                }

                senderListId=null;
                receiverListId=null;
            },
         
            receive: function(event, ui){
                // if task changes its tasklist

                let senderListId = ui.sender.closest(".tasklist").attr("id");
                let receiverTaskList = getThis();               // tasklist-receiver object
                let senderRef = getTasklistRef(senderListId);   // tasklist-sender firebase ref
                let receiverRef = getThis().ref;                // tasklist-receiver firebase ref

                prev = $(ui.item).prev().attr('id'); // after drop
                next = $(ui.item).next().attr('id');

                let taskId = ui.item.attr("id");
                receiverListId = $(this).parents(".tasklist").attr("id");
                ui.item.remove();   //to remove jqueryui li item we don't need because li will be added on child_added firebase event 

                senderRef.child(taskId).once("value", function(snap){
                    let task = new Task(snap.val());
                    let lc = null;
                    
                    let newtaskId = receiverTaskList.saveTask(task);
                    senderRef.child(taskId).remove();
                    wrapSortStop(newtaskId, prev, next);
                });

                senderListId=null;
                receiverListId=null;
                getThis().load();
            },

            remove: function(event, ui){
                //if task changes its tasklist

                if (prev !== $(ui.item).prev().attr('id')){
                    prev = $(ui.item).prev().attr('id');
                }
            },

            connectWith:".tasks"             

        });

        // Render all tasks
            for (var task in this.tasks){   
                this.renderTask(this.tasks[task].key,this.tasks[task]);
            };
        return false;
    };


    addTask(event){
        // add task to current tasklist
        let input = $(event.target).parents("form").find("input");
        let description = input.val().replace(/(<([^>]+)>)/ig,"").trim();

         if (description){
            var task = new Task({'description':description, 'isCompleted':false, 'lastChanged': firebase.database.ServerValue.TIMESTAMP });
            this.saveTask(task);
            input.val("");
         }
    };

    liftUpTask(selectedTask){
        // lift task up in current tasklist
        updateLastChanged(this, selectedTask.attr("id"));
        $(selectedTask).closest("li").detach().prependTo(`#${this.id} .tasks`);

    };

    completeTask(selectedTask){
        // mark task as completed
        toggleTaskCompleted(this, selectedTask.attr("id"));
    };

    deleteTask(selectedTask){
        //delete task from the firebase
        deleteTaskFromFirebase(this, selectedTask.attr("id"));
    };

    save(){
        //save tasklist to the firebase
        saveListToFirebase(this);
    };

    saveTask(task){
        return saveTaskToFirebase(this, task);
    };

    load(){
        return loadListFromFirebase(this);
    };

    toString(){
        return this.constructor.name +" : " + this.id;
    };

};

//====================localStorage save/read =========================

function saveToLocalStorage(tasklist){
    // for local storage. Not used now.
    localStorage.setItem(`TaskList_${tasklist.id}`, JSON.stringify(tasklist.tasks));
};

function loadFromLocalStorage(tasklist){
    // for local storage. Not used now.
        let savedTasks = JSON.parse(localStorage.getItem(`TaskList_${this.id}`));
        let tasks = [];
        if (savedTasks){
            savedTasks.forEach(function(savedTask){
                let task = new Task(savedTask.description);
                task.isCompleted = savedTask.isCompleted;
                tasks.push(task);
            },this);
        };
        return tasks;
};


//=======================firebase save/read ==========================


function loadListFromFirebase(tasklist){
    // load tasklist from firebase and save tasks in tasklist.tasks

    ///// create promise - создание промиса, который загружает список задач из Firebase

    //loadingDiv = addLoadingDiv();
    //console.log(loadingDiv);
    var taskListPromise = new Promise(function(resolve, reject) {

        let tasks=[];
        tasklist.ref.orderByChild("lastChanged").once('value',function(snapshot) {    //value
            snapshot.forEach(function(item){

                let task = item.val();
                task.key = item.key;
                tasks.push(task);
            });  
            resolve(tasks);

            })
    });

    // after taskListPromise  resolved , tasklist renders.
    taskListPromise.then(function(tasks){
        tasklist.tasks = tasks;
        tasklist.render();
    });

    //$("#loading-div").remove();
};

function deleteTaskFromFirebase(tasklist, taskId){
    // Delete task from firebase
    return tasklist.ref.child(taskId).remove();
};

function updateLastChanged(tasklist, taskId){
    // update lastChanged value for tasks sorting
    if (tasklist.ref.child(taskId).once("value", function(snap){
        if (snap.exists()){
            let taskRef = tasklist.ref.child(taskId);
            taskRef.update({
                "lastChanged": firebase.database.ServerValue.TIMESTAMP
            });
            taskRef.child('lastChanged').on('value', function(snapshot) {
                if (snapshot.val()) {
                    taskRef.update({
                        "-lastChanged": -1*snapshot.val()
                    });
                }
            });
        }
        return false;
    }));
};

function getTaskFromFirebase(tasklist, taskId){
    //console.log(tasklist.ref.child(taskId).once('value'));
    let result = null;
    tasklist.ref.child(taskId).once('value', function(snapshot){
        result =  snapshot.val();
    });
    return result;
};

function toggleTaskCompleted(tasklist, taskId){
    // Переключает признак выполнения задачи true/false
    taskRef = tasklist.ref.child(taskId);
    taskRef.transaction(function(taskId){
        if(taskId){
            taskId.isCompleted = !taskId.isCompleted;
        }
        return taskId;
    });

};

function addTaskCompletedListener(tasklist, taskId, taskHtml){
    // changes appearance of task in rendered tasklist if task.isCompleted changes

    tasklist.ref.child(taskId).child("isCompleted").on("value", function(snap){
        //console.log(snap.val());
        if(snap.val()){
            taskHtml.addClass("done");
            taskHtml.find(".fa.fa-times").show();
        } else {
            taskHtml.removeClass("done");
            taskHtml.find(".fa.fa-times").hide();
        };
    });
}

function saveTaskToFirebase(tasklist, task){
    // Save task in the firebase in the current user folder. 
    // Сохраняет задачу в Firebase в ветке текущего пользователя.
    let taskId = tasklist.ref.push(task).key;
    updateLastChanged(tasklist, taskId);
    return taskId;
};

function getTasklistRef(tasklistId){
    //Return firebase reference for the tasklist with id=taskListId
    let currentUid = firebase.auth().currentUser.uid;
    let ref = firebase.database().ref('users/'+currentUid+'/'+tasklistId);
    return ref;

}

function moveFirebasebRecord(oldRef, newRef) {    
     oldRef.once('value', function(snap)  {
          newRef.set( snap.val(), function(error) {
               if( !error ) {
                    //oldRef.remove(); 
                }
               else if( typeof(console) !== 'undefined' && console.error ) {
                   console.error(error); 
                }
          });
     });
}


function writeUserData(userId, name, email, photoUrl) {
    // Save user data in the firebase
    // Запись данных пользователя в базу Firebase/users/$uid
    firebase.database().ref('users/'+ userId).update({
        username: name,
        email: email,
        profile_picture : photoUrl
    });
};

function userExists(userId){
    // Check if user is existing user
    // Проверка, существует ли пользователь с таким userId в базе
    // возвращает true или false
    let usersRef = firebase.database().ref('users');
    let exists = false;
    usersRef.child(userId).once('value', function(snapshot){
        exists = (snapshot.val() !== null);
        //console.log(exists);
    });
    return exists;
};

function addLoadingDiv(){
    let loadingDiv = '<div id="loading-div" style="background-color:white; width:100%; height:100%; position:fixed; font-size:10vw">LOADING...</div>';
    $("body").append(loadingDiv);
    return $(loadingDiv);
}

var main = ()=>{

    var currentUid = null;

// ------------ online/offline indicator near user name ----------
    let refConnect = firebase.database().ref(".info/connected");
    refConnect.on('value', function(snap){
        if (snap.val()) {
            $("#online").css("background-color","rgba(76, 141, 44, 0.9)");
        } else {
            $("#online").css("background-color","rgba(215, 40, 40, 0.9)");
        }
        
    });

    // USER AUTHORIZATION 
    firebase.auth().onAuthStateChanged(function(user) {  
        if (user && user.uid != currentUid) {  

        // Обновляем UID текущего пользователя 
            currentUid = user.uid;
            let userName =  user.displayName;  
            let userEmail = user.email;
            let userPhotoUrl = user.photoURL;

            if (!userExists(currentUid)) {
                writeUserData(currentUid,userName,userEmail, userPhotoUrl);
            }
            
            // User online/offline indicator
            $('#userinfo').append(`<img src="${userPhotoUrl}" />`);
            $("#userinfo").append(userName);
            $("#userinfo").append('<div id="online" style="display:inline-block;'+
                                 'width:10px; height:10px; border-radius:10px; border: 1px solid DarkGray;'+
                                 'margin: 0 20px;'+
                                 '"></div>');

            // creating tasklists
            // создаем списки.  (id, title)
            white_tl = new TaskList('white','<i class="fa fa-sun-o"></i>');
            black_tl = new TaskList('black','<i class="fa fa-moon-o"></i>');

            white_tl.addTitleHref(`#${black_tl.id}`);
            black_tl.addTitleHref(`#${white_tl.id}`);


        } else {  
            //user logout
            currentUid = null;
            window.location = "index.html";   
        }  
    });

}   

$(document).ready(main);