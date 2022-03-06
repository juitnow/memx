console.log(`Running on NodeJS version ${process.version}`)
process.on('exit', () => console.log(`Running on NodeJS version ${process.version}`))

/* Always use "chai as promised" */
import chai from 'chai'
import chap from 'chai-as-promised'
import chae from 'chai-exclude'
chai.use(chap).use(chae)

/* Support source maps as we mangle code for coverage */
import sms from 'source-map-support'
sms.install({ hookRequire: true })
